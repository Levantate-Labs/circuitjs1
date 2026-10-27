/*
    Copyright (C) 2026 Levantate Labs

    This file is part of the Levantate Labs fork of CircuitJS1, distributed under
    the GNU General Public License, version 2 or (at your option) any later
    version. See COPYING.txt.
*/

// Scope panel (roadmap slice L9): a bench-scope front panel for one of the
// graphs, opened from its gear. Upstream's scope already has a trigger and
// measurements but hides them in a long dialog; this puts the everyday
// controls in reach and adds two cursors:
//   - timebase: the visible window, − / +;
//   - trigger: off / auto / normal, rising or falling edge, level;
//   - measurements: chips for max, min, peak-to-peak, average, RMS,
//     frequency and duty cycle (shown on the graph, as upstream draws them);
//   - cursors A and B, fixed on screen like a bench scope's: drag them inside
//     the graph; the panel reads each value, Δt, 1/Δt and ΔV.
// "All settings…" opens upstream's dialog.

import { Theme } from "../theme";
import { makePanelDraggable, placePanel } from "./leads";

export interface ScopePanelHost {
    canvas: HTMLCanvasElement;
    container: HTMLElement;
    scopes(): any[];                    // the docked scopes
    timeText(t: number): string;
    unitText(plot: any, v: number): string;
    repaint(): void;
}

const TRIGGER = { off: 0, normal: 1, auto: 2 };   // ScopeTrigger.TRIGGER_FREERUN / NORMAL / AUTO
const MEASURES: { key: string; label: string; title: string }[] = [
    { key: "showMax", label: "Max", title: "Maximum" },
    { key: "showMin", label: "Min", title: "Minimum" },
    { key: "showP2P", label: "P-P", title: "Peak to peak" },
    { key: "showAverage", label: "Avg", title: "Average" },
    { key: "showRMS", label: "RMS", title: "RMS" },
    { key: "showFreq", label: "Freq", title: "Frequency" },
    { key: "showDutyCycle", label: "Duty", title: "Duty cycle" },
];
const CURSOR_HIT_PX = 6;

export class ScopePanel {
    private readonly panel: HTMLElement;
    private scope: any = null;
    private cursors = false;
    private cursorA = 0.35;             // positions across the graph, 0..1
    private cursorB = 0.65;
    private readonly readout: HTMLElement;
    private readonly windowText: HTMLElement;
    private readonly title: HTMLElement;
    private readonly level: HTMLInputElement;

    constructor(private readonly host: ScopePanelHost) {
        this.panel = document.createElement("div");
        this.panel.className = "lvInstr lvScopePanel lvHidden";
        this.panel.setAttribute("role", "dialog");
        this.panel.setAttribute("aria-label", "Scope controls");
        this.panel.innerHTML = `
<div class="lvMeterHead"><span class="lvScopeTitle">Scope</span>
  <button type="button" class="lvMeterClose" aria-label="Close scope controls" title="Close">×</button></div>
<div class="lvScopeRow"><span>Time</span><button type="button" data-act="faster" title="Shorter window">−</button><b class="lvScopeWindow"></b><button type="button" data-act="slower" title="Longer window">+</button></div>
<div class="lvScopeRow"><span>Trigger</span><div class="lvSeg" data-group="trigger">
  <button type="button" data-mode="off">Off</button><button type="button" data-mode="auto">Auto</button><button type="button" data-mode="normal">Normal</button></div></div>
<div class="lvScopeRow"><span></span><div class="lvSeg" data-group="edge">
  <button type="button" data-edge="0" title="Rising edge">↗</button><button type="button" data-edge="1" title="Falling edge">↘</button></div>
  <label class="lvScopeLevel">at <input type="number" step="any" aria-label="Trigger level"></label></div>
<div class="lvScopeChips" role="group" aria-label="Measurements"></div>
<button type="button" class="lvInstrOutput lvScopeCursors" aria-pressed="false">Cursors</button>
<div class="lvScopeReadout lvHidden" aria-live="polite"></div>
<button type="button" class="lvScopeMore">All settings…</button>`;
        this.title = this.panel.querySelector(".lvScopeTitle")!;
        this.windowText = this.panel.querySelector(".lvScopeWindow")!;
        this.readout = this.panel.querySelector(".lvScopeReadout")!;
        this.level = this.panel.querySelector(".lvScopeLevel input")!;
        this.panel.querySelector(".lvMeterClose")!.addEventListener("click", () => this.close());
        this.panel.querySelector("[data-act=faster]")!.addEventListener("click", () => this.withScope((s) => s.speedUp()));
        this.panel.querySelector("[data-act=slower]")!.addEventListener("click", () => this.withScope((s) => s.slowDown()));
        for (const b of Array.from(this.panel.querySelectorAll<HTMLElement>("[data-mode]")))
            b.addEventListener("click", () => this.withScope((s) => s.setTriggerMode((TRIGGER as any)[b.dataset.mode!])));
        for (const b of Array.from(this.panel.querySelectorAll<HTMLElement>("[data-edge]")))
            b.addEventListener("click", () => this.withScope((s) => { s.trigger.edge = Number(b.dataset.edge); }));
        this.level.addEventListener("change", () => {
            const v = Number(this.level.value);
            if (isFinite(v))
                this.withScope((s) => { s.trigger.level = v; });
        });
        for (const ev of ["keydown", "keypress", "keyup"])
            this.level.addEventListener(ev, (e) => e.stopPropagation());
        const chips = this.panel.querySelector(".lvScopeChips")!;
        for (const m of MEASURES) {
            const b = document.createElement("button");
            b.type = "button";
            b.textContent = m.label;
            b.title = m.title;
            b.dataset.key = m.key;
            b.addEventListener("click", () => this.withScope((s) => { s[m.key] = !s[m.key]; }));
            chips.appendChild(b);
        }
        this.panel.querySelector(".lvScopeCursors")!.addEventListener("click", () => {
            this.cursors = !this.cursors;
            this.host.repaint();
        });
        this.panel.querySelector(".lvScopeMore")!.addEventListener("click", () => {
            const s = this.scope;
            this.close();
            s?.showProperties();
        });
        makePanelDraggable(this.panel, this.panel.querySelector(".lvMeterHead")!, host.container, () => host.repaint());
        host.container.appendChild(this.panel);
        // dragging a cursor takes the press before the canvas handlers see it
        host.container.addEventListener("pointerdown", (e) => this.pointerDown(e), true);
    }

    isOpen(): boolean { return this.scope != null; }

    open(scope: any): void {
        this.scope = scope;
        this.panel.classList.remove("lvHidden");
        placePanel(this.panel, this.host.container);
        this.level.value = String(scope.trigger.level);
        this.host.repaint();
    }

    close(): void {
        this.scope = null;
        this.cursors = false;
        this.panel.classList.add("lvHidden");
        this.host.repaint();
    }

    private withScope(f: (s: any) => void): void {
        if (this.scope == null)
            return;
        f(this.scope);
        this.host.repaint();
    }

    // Once a frame, after the graphs are drawn: refresh the panel and draw the
    // cursors on the scope. `g` is the app's Graphics in canvas pixels.
    draw(g: any): void {
        const s = this.scope;
        if (s == null)
            return;
        if (!this.host.scopes().includes(s)) {
            this.close();           // the graph was removed
            return;
        }
        this.title.textContent = s.getScopeText?.() ?? "Scope";
        const span = s.sim.maxTimeStep * s.speed * s.rect.width;
        this.windowText.textContent = this.host.timeText(span);
        const mode = s.trigger.mode === TRIGGER.normal ? "normal" : s.trigger.mode === TRIGGER.auto ? "auto" : "off";
        for (const b of Array.from(this.panel.querySelectorAll<HTMLElement>("[data-mode]")))
            b.classList.toggle("on", b.dataset.mode === mode);
        for (const b of Array.from(this.panel.querySelectorAll<HTMLElement>("[data-edge]")))
            b.classList.toggle("on", Number(b.dataset.edge) === s.trigger.edge);
        this.panel.querySelector(".lvSeg[data-group=edge]")!.classList.toggle("lvDim", mode === "off");
        this.level.disabled = mode === "off";
        for (const b of Array.from(this.panel.querySelectorAll<HTMLElement>(".lvScopeChips button")))
            b.classList.toggle("on", !!s[b.dataset.key!]);
        const cb = this.panel.querySelector<HTMLElement>(".lvScopeCursors")!;
        cb.classList.toggle("on", this.cursors);
        cb.setAttribute("aria-pressed", String(this.cursors));
        cb.textContent = this.cursors ? "Cursors on" : "Cursors";

        this.readout.classList.toggle("lvHidden", !this.cursors);
        if (!this.cursors)
            return;
        const plot = s.visiblePlots?.[s.selectedPlot >= 0 ? s.selectedPlot : 0];
        const r = s.rect;
        const xA = Math.round(r.x + this.cursorA * r.width), xB = Math.round(r.x + this.cursorB * r.width);
        const line = (x: number, label: string) => {
            g.setColor(Theme.palette.guide);
            g.drawLine(x + 0.5, r.y, x + 0.5, r.y + r.height);
            g.context.save();
            g.context.fillStyle = Theme.palette.guide;
            g.context.font = "700 11px 'Plus Jakarta Sans Variable', system-ui, sans-serif";
            g.context.fillText(label, x + 3, r.y + 12);
            g.context.restore();
        };
        line(xA, "A");
        line(xB, "B");
        const vA = plot ? s.drawPlotDot(g, plot, xA) : NaN;
        const vB = plot ? s.drawPlotDot(g, plot, xB) : NaN;
        const dt = Math.abs(s.mouseXToTime(xB) - s.mouseXToTime(xA));
        const val = (v: number) => (plot && isFinite(v) ? this.host.unitText(plot, v) : "—");
        this.readout.innerHTML =
            `<span>A</span><b>${val(vA)}</b><span>B</span><b>${val(vB)}</b>` +
            `<span>Δt</span><b>${this.host.timeText(dt)}</b>` +
            `<span>1/Δt</span><b>${dt > 0 ? formatHz(1 / dt) : "—"}</b>` +
            `<span>ΔV</span><b>${plot && isFinite(vA) && isFinite(vB) ? this.host.unitText(plot, vB - vA) : "—"}</b>`;
    }

    private pointerDown(e: PointerEvent): void {
        const s = this.scope;
        if (s == null || !this.cursors || e.button !== 0 || e.target !== this.host.canvas)
            return;
        const c = this.host.canvas.getBoundingClientRect();
        const x = e.clientX - c.left, y = e.clientY - c.top;
        const r = s.rect;
        if (y < r.y || y > r.y + r.height)
            return;
        const near = (f: number) => Math.abs(r.x + f * r.width - x) <= CURSOR_HIT_PX;
        const which = near(this.cursorA) ? "A" : near(this.cursorB) ? "B" : null;
        if (which == null)
            return;
        e.preventDefault();
        e.stopPropagation();
        const move = (ev: PointerEvent) => {
            const f = Math.min(1, Math.max(0, (ev.clientX - c.left - r.x) / r.width));
            if (which === "A") this.cursorA = f; else this.cursorB = f;
            this.host.repaint();
        };
        const up = () => {
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", up);
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
    }
}

export function formatHz(f: number): string {
    if (f >= 1e6) return (f / 1e6).toPrecision(4) + " MHz";
    if (f >= 1e3) return (f / 1e3).toPrecision(4) + " kHz";
    return f.toPrecision(4) + " Hz";
}
