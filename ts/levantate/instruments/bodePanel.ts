/*
    Copyright (C) 2026 Levantate Labs

    This file is part of the Levantate Labs fork of CircuitJS1, distributed under
    the GNU General Public License, version 2 or (at your option) any later
    version. See COPYING.txt.
*/

// Bode plot (roadmap slice L10): the frequency response of the circuit from
// an input source to a pair of probes, from an AC analysis in ngspice
// (levantate/spice). Gain in dB and phase in degrees against a log frequency
// axis, a readout under the pointer, and the peak and −3 dB points.

import { VoltageElm } from "../../VoltageElm";
import { Exam } from "../exam/exam";
import { Theme } from "../theme";
import { summarize, valueAt, type BodePoint } from "../spice/bode";
import { engineLoaded } from "../spice/engine";
import { runAcSweep } from "../spice/ac";
import { makePanelDraggable, placePanel, ProbeLeads, type LeadsHost } from "./leads";
import { formatHz } from "./scopePanel";

export interface BodeHost extends LeadsHost {
    sourceLabel(elm: any): string;
    /** bring the circuit's analysis up to date (an edit made while stopped) */
    prepare(): void;
}

const PLOT_W = 392, PLOT_H = 250;

// axis labels: 1, 10, 100, 1k, … 1M (Hz)
function compactHz(f: number): string {
    if (f >= 1e9) return f / 1e9 + "G";
    if (f >= 1e6) return f / 1e6 + "M";
    if (f >= 1e3) return f / 1e3 + "k";
    return String(Number(f.toPrecision(3)));
}

// "-0.00 dB" reads oddly: round tiny values to zero first
const dB = (v: number) => `${(Math.abs(v) < 0.005 ? 0 : v).toFixed(2)} dB`;

// "1k", "2.2M", "50" -> number
export function parseFreq(s: string): number {
    const m = /^\s*([0-9]*\.?[0-9]+(?:e[+-]?\d+)?)\s*([kKmMgG]?)\s*(hz)?\s*$/i.exec(s);
    if (!m)
        return NaN;
    const mult: Record<string, number> = { "": 1, k: 1e3, K: 1e3, m: 1e6, M: 1e6, g: 1e9, G: 1e9 };
    return parseFloat(m[1]) * mult[m[2]];
}

export class BodePanel {
    private readonly panel: HTMLElement;
    private readonly leads: ProbeLeads;
    private readonly select: HTMLSelectElement;
    private readonly from: HTMLInputElement;
    private readonly to: HTMLInputElement;
    private readonly runButton: HTMLButtonElement;
    private readonly status: HTMLElement;
    private readonly summary: HTMLElement;
    private readonly plot: HTMLCanvasElement;
    private readonly jacks: HTMLElement[];
    private sources: any[] = [];
    private points: BodePoint[] = [];
    private netlist = "";
    private hoverX = -1;
    private open = false;
    private running = false;

    constructor(private readonly host: BodeHost, private readonly container: HTMLElement, canvas: HTMLCanvasElement) {
        this.panel = document.createElement("div");
        this.panel.className = "lvInstr lvBode lvHidden";
        this.panel.setAttribute("role", "dialog");
        this.panel.setAttribute("aria-label", "Bode plot");
        this.panel.innerHTML = `
<div class="lvMeterHead"><span>Bode plot</span>
  <button type="button" class="lvMeterClose" aria-label="Close Bode plot" title="Close">×</button></div>
<label class="lvInstrField lvBodeInput"><span>Input</span><select aria-label="Input source"></select></label>
<div class="lvBodeRange">
  <label class="lvInstrField"><span>From</span><input type="text" value="1" aria-label="Start frequency"><em>Hz</em></label>
  <label class="lvInstrField"><span>To</span><input type="text" value="1M" aria-label="Stop frequency"><em>Hz</em></label>
</div>
<button type="button" class="lvInstrOutput lvBodeRun">Run sweep</button>
<p class="lvMeterHint lvBodeStatus"></p>
<canvas class="lvBodePlot" width="${PLOT_W}" height="${PLOT_H}" aria-label="Gain and phase against frequency"></canvas>
<div class="lvBodeSummary" aria-live="polite"></div>
<div class="lvBodeFoot">
  <div class="lvMeterJacks"><span class="lvMeterJack red">OUT</span><span class="lvMeterJack black">REF</span></div>
  <button type="button" class="lvScopeMore lvBodeCopy">Copy SPICE netlist</button>
</div>`;
        this.select = this.panel.querySelector("select")!;
        [this.from, this.to] = Array.from(this.panel.querySelectorAll<HTMLInputElement>(".lvBodeRange input"));
        this.runButton = this.panel.querySelector(".lvBodeRun")!;
        this.status = this.panel.querySelector(".lvBodeStatus")!;
        this.summary = this.panel.querySelector(".lvBodeSummary")!;
        this.plot = this.panel.querySelector(".lvBodePlot")!;
        this.jacks = Array.from(this.panel.querySelectorAll<HTMLElement>(".lvMeterJack"));
        this.panel.querySelector(".lvMeterClose")!.addEventListener("click", () => this.setOpen(false));
        this.runButton.addEventListener("click", () => void this.run());
        this.panel.querySelector(".lvBodeCopy")!.addEventListener("click", () => {
            if (this.netlist)
                void navigator.clipboard?.writeText(this.netlist);
            this.setStatus(this.netlist ? "Netlist copied." : "Run a sweep first.");
        });
        for (const el of [this.from, this.to, this.select])
            for (const ev of ["keydown", "keypress", "keyup"])
                el.addEventListener(ev, (e) => e.stopPropagation());
        this.plot.addEventListener("pointermove", (e) => {
            const r = this.plot.getBoundingClientRect();
            this.hoverX = (e.clientX - r.left) * (PLOT_W / r.width);
            this.drawPlot();
        });
        this.plot.addEventListener("pointerleave", () => {
            this.hoverX = -1;
            this.drawPlot();
        });
        makePanelDraggable(this.panel, this.panel.querySelector(".lvMeterHead")!, container, () => host.repaint());
        container.appendChild(this.panel);
        this.leads = new ProbeLeads(host, canvas, { park: { x: 0.7, y: 0.4 }, onChange: () => host.repaint() });
        container.addEventListener("pointerdown", (e) => {
            if (this.open && e.button === 0 && e.target === canvas)
                this.leads.pointerDown(e);
        }, true);
        this.drawPlot();
    }

    isOpen(): boolean { return this.open; }

    toggle(): void { this.setOpen(!this.open); }

    setOpen(on: boolean): void {
        this.open = on;
        this.panel.classList.toggle("lvHidden", !on);
        if (on) {
            placePanel(this.panel, this.container);
            this.leads.parkIfNew();
            this.refreshSources();
            this.setStatus(this.points.length ? "" : "Pick the input, put OUT (and REF, or leave it on ground) on the circuit, then run.");
        }
        this.host.repaint();
    }

    private setStatus(s: string): void {
        this.status.textContent = s;
        this.status.classList.toggle("lvHidden", s === "");
    }

    private refreshSources(): void {
        const list: any[] = this.host.elements().filter((e) => e instanceof VoltageElm);
        const same = list.length === this.sources.length && list.every((e, i) => e === this.sources[i]);
        if (same)
            return;
        const keep = this.sources[this.select.selectedIndex];
        this.sources = list;
        this.select.innerHTML = "";
        for (const e of list) {
            const o = document.createElement("option");
            o.textContent = this.host.sourceLabel(e);
            this.select.appendChild(o);
        }
        // keep the choice; otherwise prefer the generator, then an AC source
        let i = list.indexOf(keep);
        if (i < 0) i = list.findIndex((e) => e.levInstrument);
        if (i < 0) i = list.findIndex((e) => e.waveform !== 0);
        this.select.selectedIndex = Math.max(0, i);
    }

    private async run(): Promise<void> {
        if (this.running)
            return;
        this.refreshSources();
        const input = this.sources[this.select.selectedIndex];
        const out = this.leads.red.contact, ref = this.leads.black.contact;
        const f0 = parseFreq(this.from.value), f1 = parseFreq(this.to.value);
        if (input == null)
            return this.setStatus("The circuit has no voltage source to sweep.");
        if (out == null)
            return this.setStatus("Put the red OUT probe on the point you want to see.");
        if (!(f0 > 0) || !(f1 > f0))
            return this.setStatus("Set a range, e.g. 10 to 100k (Hz).");
        this.running = true;
        this.runButton.disabled = true;
        this.host.prepare();
        this.setStatus(engineLoaded() ? "Running…" : "Loading the SPICE engine (about 6 MB, only the first time)…");
        try {
            const node = (c: typeof out) => (c ? (c.elm as any).nodes?.[c.post] : null);
            const r = await runAcSweep({
                elms: this.host.elements(), input, plus: node(out), minus: node(ref),
                fStart: f0, fStop: f1, perDecade: 40,
            });
            this.points = r.points;
            this.netlist = r.netlist;
            this.setStatus(r.unsupported.length ? `Left out of the analysis: ${r.unsupported.join(", ")}.` : "");
            this.renderSummary();
        } catch (e) {
            this.setStatus("The sweep didn't run: " + (e as Error).message);
        } finally {
            this.running = false;
            this.runButton.disabled = false;
            this.drawPlot();
        }
    }

    private renderSummary(): void {
        if (this.points.length === 0) {
            this.summary.innerHTML = "";
            return;
        }
        const s = summarize(this.points);
        const cut = [s.lowCutoff, s.highCutoff].filter((f): f is number => f != null).map(formatHz);
        this.summary.innerHTML =
            `<span>Peak</span><b>${dB(s.peakDb)} at ${formatHz(s.peakF)}</b>` +
            `<span>−3 dB</span><b>${cut.length ? cut.join(" and ") : "not in range"}</b>`;
    }

    // ---- plot ----

    private drawPlot(): void {
        const c = this.plot.getContext("2d");
        if (!c)
            return;
        const pal = Theme.palette;
        const W = PLOT_W, H = PLOT_H, L = 44, R = 12, gainH = 116, gap = 22, T = 8;
        const phaseTop = T + gainH + gap, phaseH = H - phaseTop - 18;
        c.clearRect(0, 0, W, H);
        c.font = "10px 'Plus Jakarta Sans Variable', system-ui, sans-serif";
        c.fillStyle = pal.scopeBg;
        c.fillRect(0, 0, W, H);
        const pts = this.points;
        if (pts.length < 2) {
            c.fillStyle = pal.inkMuted;
            c.textAlign = "center";
            c.fillText("Run a sweep to see the gain and phase", W / 2, H / 2);
            return;
        }
        const lf0 = Math.log10(pts[0].f), lf1 = Math.log10(pts[pts.length - 1].f);
        const x = (f: number) => L + ((Math.log10(f) - lf0) / (lf1 - lf0)) * (W - L - R);
        const range = (vals: number[], step: number) => {
            let lo = Math.min(...vals), hi = Math.max(...vals);
            lo = Math.floor(lo / step) * step;
            hi = Math.ceil(hi / step) * step;
            if (hi - lo < step) hi = lo + step;
            return [lo, hi];
        };
        const gains = pts.map((p) => Math.max(-200, p.gainDb));
        const [g0, g1] = range(gains, 10);
        const [p0, p1] = range(pts.map((p) => p.phaseDeg), 45);
        const yg = (v: number) => T + (1 - (v - g0) / (g1 - g0)) * gainH;
        const yp = (v: number) => phaseTop + (1 - (v - p0) / (p1 - p0)) * phaseH;

        // grid: decades, and dB / degree lines
        c.strokeStyle = pal.gridMinor;
        c.lineWidth = 1;
        c.fillStyle = pal.inkMuted;
        c.textAlign = "center";
        for (let d = Math.ceil(lf0); d <= Math.floor(lf1); d++) {
            const gx = Math.round(x(10 ** d)) + 0.5;
            c.beginPath();
            c.moveTo(gx, T);
            c.lineTo(gx, phaseTop + phaseH);
            c.stroke();
            c.fillText(compactHz(10 ** d), gx, H - 5);
        }
        c.textAlign = "right";
        const gStep = Math.max(10, Math.ceil((g1 - g0) / 4 / 10) * 10);
        for (let v = g1; v > g0; v -= gStep) {   // (the bottom line's label would crowd the phase plot)
            const gy = Math.round(yg(v)) + 0.5;
            c.beginPath(); c.moveTo(L, gy); c.lineTo(W - R, gy); c.stroke();
            c.fillText(`${v} dB`, L - 4, gy + 3);
        }
        const pStep = Math.max(45, Math.ceil((p1 - p0) / 4 / 45) * 45);
        for (let v = p0; v <= p1; v += pStep) {
            const py = Math.round(yp(v)) + 0.5;
            c.beginPath(); c.moveTo(L, py); c.lineTo(W - R, py); c.stroke();
            c.fillText(`${v}°`, L - 4, py + 3);
        }

        const trace = (y: (p: BodePoint) => number, color: string) => {
            c.beginPath();
            pts.forEach((p, i) => (i ? c.lineTo(x(p.f), y(p)) : c.moveTo(x(p.f), y(p))));
            c.strokeStyle = color;
            c.lineWidth = 2;
            c.stroke();
        };
        trace((p) => yg(Math.max(-200, p.gainDb)), pal.traceVoltage);
        trace((p) => yp(p.phaseDeg), pal.traceCurrent);

        // −3 dB marker(s)
        const s = summarize(pts);
        c.setLineDash([4, 3]);
        c.strokeStyle = pal.guide;
        for (const f of [s.lowCutoff, s.highCutoff]) {
            if (f == null) continue;
            const gx = x(f);
            c.beginPath(); c.moveTo(gx, T); c.lineTo(gx, T + gainH); c.stroke();
        }
        c.setLineDash([]);

        // readout under the pointer
        if (this.hoverX >= L && this.hoverX <= W - R) {
            const f = 10 ** (lf0 + ((this.hoverX - L) / (W - L - R)) * (lf1 - lf0));
            c.strokeStyle = pal.inkMuted;
            c.beginPath(); c.moveTo(this.hoverX + 0.5, T); c.lineTo(this.hoverX + 0.5, phaseTop + phaseH); c.stroke();
            const text = `${formatHz(f)}   ${dB(valueAt(pts, f, "gainDb"))}   ${valueAt(pts, f, "phaseDeg").toFixed(1)}°`;
            c.font = "600 11px 'Plus Jakarta Sans Variable', system-ui, sans-serif";
            const tw = c.measureText(text).width + 12;
            const bx = Math.min(W - R - tw, Math.max(L, this.hoverX - tw / 2));
            c.fillStyle = pal.guide;
            c.beginPath(); c.roundRect(bx, T + 2, tw, 18, 9); c.fill();
            c.fillStyle = pal.guideText;
            c.textAlign = "left";
            c.fillText(text, bx + 6, T + 15);
        }
    }

    draw(ctx: CanvasRenderingContext2D): void {
        if (!this.open)
            return;
        this.leads.refresh();
        this.refreshSources();
        this.panel.querySelector<HTMLElement>(".lvBodeCopy")!.classList.toggle("lvHidden", Exam.active);
        ctx.save();
        this.leads.draw(ctx, this.jacks);
        ctx.restore();
    }
}
