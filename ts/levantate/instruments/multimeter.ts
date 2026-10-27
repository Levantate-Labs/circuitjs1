/*
    Copyright (C) 2026 Levantate Labs

    This file is part of the Levantate Labs fork of CircuitJS1, distributed under
    the GNU General Public License, version 2 or (at your option) any later
    version. See COPYING.txt.
*/

// Multimeter (roadmap slice L9): a bench meter over the canvas that never
// changes the circuit. In volts and ohms the student drags a red and a black
// probe onto terminals or wires; in amps a clamp goes around one part. Like a
// real meter it averages for a moment and refreshes a few times a second: DC
// shows the average, AC the RMS of the varying part. Works in tests, where the
// circuit's own parts may be locked.

import { Theme } from "../theme";
import {
    CycleWindow, findContact, formatReading, resistanceBetween,
    type MeterElm, type MeterMode, type PointLike, type ProbeContact,
} from "./meterLogic";

export interface MeterHost {
    transform(): number[];          // [scale, 0, 0, scale, tx, ty]: circuit to canvas pixels
    elements(): any[];
    simTime(): number;
    repaint(): void;
}

const MODES: { mode: MeterMode; label: string; title: string }[] = [
    { mode: "dcv", label: "V⎓", title: "DC volts" },
    { mode: "acv", label: "V~", title: "AC volts (RMS)" },
    { mode: "dca", label: "A⎓", title: "DC amps (clamp)" },
    { mode: "aca", label: "A~", title: "AC amps (clamp, RMS)" },
    { mode: "ohm", label: "Ω", title: "Resistance of one part" },
];

const RED = "#e5484d";
const TIP_HIT_PX = 14;          // grab a probe tip within this many screen pixels
const CONTACT_REACH_PX = 14;    // a dropped tip touches things within this many pixels
const WINDOW_WALL_MS = 350;      // refresh a few times a second…
const WINDOW_SIM_S = 0.1;        // …or after this much simulated time (whole cycles)
const WINDOW_MAX_SIM_S = 0.5;    // a slow, non-repeating change: refresh anyway
const WINDOW_MAX_WALL_MS = 3000; // a very slow simulation: refresh anyway

interface Probe {
    at: PointLike;              // circuit coordinates
    contact: ProbeContact | null;
}

export class Multimeter {
    private readonly panel: HTMLElement;
    private readonly digits: HTMLElement;
    private readonly unit: HTMLElement;
    private readonly modeTag: HTMLElement;
    private readonly hint: HTMLElement;
    private readonly jacks: HTMLElement[];
    private readonly modeButtons = new Map<MeterMode, HTMLButtonElement>();
    private readonly clampButton: HTMLButtonElement;

    private open = false;
    private mode: MeterMode = "dcv";
    private red: Probe = { at: { x: 0, y: 0 }, contact: null };
    private black: Probe = { at: { x: 0, y: 0 }, contact: null };
    private placed = false;
    private dragging: Probe | null = null;
    private clampTarget: any = null;
    private picking = false;

    private window = new CycleWindow();
    private windowStartWall = 0;
    private shown = NaN;

    constructor(private readonly host: MeterHost, private readonly container: HTMLElement,
                private readonly canvas: HTMLCanvasElement) {
        this.panel = document.createElement("div");
        this.panel.className = "lvMeter lvHidden";
        this.panel.setAttribute("role", "dialog");
        this.panel.setAttribute("aria-label", "Multimeter");
        this.panel.innerHTML = `
<div class="lvMeterHead"><span>Multimeter</span>
  <button type="button" class="lvMeterClose" aria-label="Close multimeter" title="Close">×</button></div>
<div class="lvMeterLcd" aria-live="polite"><span class="lvMeterDigits">- - - -</span><span class="lvMeterUnit">V</span><span class="lvMeterMode">DC</span></div>
<div class="lvMeterModes" role="radiogroup" aria-label="Measure"></div>
<button type="button" class="lvMeterClamp">Clamp a part</button>
<p class="lvMeterHint"></p>
<div class="lvMeterJacks"><span class="lvMeterJack red" title="Red probe">V Ω</span><span class="lvMeterJack black" title="Black probe">COM</span></div>`;
        this.digits = this.panel.querySelector(".lvMeterDigits")!;
        this.unit = this.panel.querySelector(".lvMeterUnit")!;
        this.modeTag = this.panel.querySelector(".lvMeterMode")!;
        this.hint = this.panel.querySelector(".lvMeterHint")!;
        this.jacks = Array.from(this.panel.querySelectorAll<HTMLElement>(".lvMeterJack"));
        this.clampButton = this.panel.querySelector(".lvMeterClamp")!;
        const modes = this.panel.querySelector(".lvMeterModes")!;
        for (const m of MODES) {
            const b = document.createElement("button");
            b.type = "button";
            b.textContent = m.label;
            b.title = m.title;
            b.setAttribute("role", "radio");
            b.addEventListener("click", () => this.setMode(m.mode));
            modes.appendChild(b);
            this.modeButtons.set(m.mode, b);
        }
        this.panel.querySelector(".lvMeterClose")!.addEventListener("click", () => this.setOpen(false));
        this.clampButton.addEventListener("click", () => {
            this.picking = !this.picking;
            this.render();
        });
        this.makeDraggable(this.panel.querySelector(".lvMeterHead")!);
        container.appendChild(this.panel);

        // in front of the canvas's own handlers: probes and the clamp take the click
        container.addEventListener("pointerdown", (e) => this.pointerDown(e), true);
        window.addEventListener("keydown", (e) => {
            if (e.key === "Escape" && this.picking) {
                this.picking = false;
                this.render();
            }
        });
        this.setMode("dcv");
    }

    isOpen(): boolean { return this.open; }

    toggle(): void { this.setOpen(!this.open); }

    setOpen(on: boolean): void {
        this.open = on;
        this.panel.classList.toggle("lvHidden", !on);
        if (on && !this.placed)
            this.parkProbes();
        this.resetWindow();
        this.render();
        this.host.repaint();
    }

    setMode(m: MeterMode): void {
        this.mode = m;
        for (const [mode, b] of this.modeButtons) {
            b.classList.toggle("on", mode === m);
            b.setAttribute("aria-checked", String(mode === m));
        }
        this.picking = this.isAmps() && this.clampTarget == null;
        this.shown = NaN;
        this.resetWindow();
        this.render();
        this.host.repaint();
    }

    private isAmps(): boolean { return this.mode === "dca" || this.mode === "aca"; }

    // ---- readings ----

    private voltageAt(c: ProbeContact | null): number {
        if (c == null)
            return NaN;
        try {
            return c.elm.getPostVoltage(c.post);
        } catch {
            return NaN;
        }
    }

    private raw(): number {
        if (this.isAmps()) {
            const t = this.clampTarget;
            return t != null && this.host.elements().includes(t) ? t.getCurrent() : NaN;
        }
        return this.voltageAt(this.red.contact) - this.voltageAt(this.black.contact);
    }

    // Called on every simulation time step.
    sample(): void {
        if (!this.open || this.mode === "ohm")
            return;
        const v = this.raw();
        if (!isFinite(v))
            return;
        this.window.add(this.host.simTime(), v);
        // A changing signal is read over whole cycles, whatever the simulation
        // speed (a slow one may run a fraction of a cycle per second); a steady
        // one refreshes on the timer.
        const w = this.window;
        const wall = performance.now() - this.windowStartWall;
        // (a reading over part of a cycle would be wrong, so a slow simulation
        // keeps integrating rather than refresh early)
        const done = (wall >= WINDOW_WALL_MS && (w.steady || w.cycles >= 2)) ||
            (w.duration >= WINDOW_SIM_S && w.cycles >= 1) ||
            (wall >= WINDOW_MAX_WALL_MS && w.cycles >= 1) ||
            w.duration >= WINDOW_MAX_SIM_S;
        if (done) {
            const { avg, rms } = w.result();
            this.shown = this.mode === "dcv" || this.mode === "dca" ? avg : Math.sqrt(Math.max(0, rms * rms - avg * avg));
            this.resetWindow(w.observedRange);
        }
    }

    // range: the last window's, to spot cycles from the start of the next one
    private resetWindow(range: { min: number; max: number } | null = null): void {
        this.window = new CycleWindow(range);
        this.windowStartWall = performance.now();
    }

    // ---- per frame: contacts, display, drawing ----

    private toScreen(p: PointLike): PointLike {
        const t = this.host.transform();
        return { x: p.x * t[0] + t[4], y: p.y * t[3] + t[5] };
    }

    private toCircuit(sx: number, sy: number): PointLike {
        const t = this.host.transform();
        return { x: (sx - t[4]) / t[0], y: (sy - t[5]) / t[3] };
    }

    private reach(): number {
        return CONTACT_REACH_PX / this.host.transform()[0];
    }

    private refreshContacts(): void {
        const elms = this.host.elements() as MeterElm[];
        for (const p of [this.red, this.black]) {
            if (p === this.dragging)
                continue;
            p.contact = findContact(elms, p.at, this.reach() * 0.5);
            if (p.contact)
                p.at = { ...p.contact.at };
        }
    }

    private sameNode(): boolean {
        const r = this.red.contact, b = this.black.contact;
        const n = (c: ProbeContact) => (c.elm as any).nodes?.[c.post];
        return r != null && b != null && n(r) != null && n(r) === n(b);
    }

    private render(): void {
        if (!this.open)
            return;
        const isAmps = this.isAmps();
        this.panel.classList.toggle("clamp", isAmps);
        this.clampButton.classList.toggle("lvHidden", !isAmps);
        this.clampButton.textContent = this.picking ? "Click a part… (Esc to cancel)" : this.clampTarget ? "Clamp another part" : "Clamp a part";
        this.clampButton.classList.toggle("on", this.picking);
        this.container.classList.toggle("lvMeterPicking", this.picking);

        let value = this.shown;
        if (this.mode === "ohm")
            value = resistanceBetween(this.red.contact, this.black.contact, this.sameNode());
        const f = formatReading(value, this.mode);
        this.digits.textContent = f.digits;
        this.unit.textContent = f.unit;
        this.modeTag.textContent = this.mode === "acv" || this.mode === "aca" ? "AC" : this.mode === "ohm" ? "" : "DC";

        let hint = "";
        if (isAmps)
            hint = this.picking ? "Click the part whose current you want." : this.clampTarget ? "" : "Clamp a part to read the current through it.";
        else if (!this.red.contact || !this.black.contact)
            hint = "Drag the red and black probe tips onto the circuit.";
        else if (this.mode === "ohm" && !isFinite(value))
            hint = "Put the probes on the two ends of one part.";
        if (hint === "" && this.mode !== "ohm" && !isFinite(this.shown) &&
                (!isAmps || this.clampTarget != null))
            hint = "Measuring… a changing signal is read over whole cycles.";
        this.hint.textContent = hint;
        this.hint.classList.toggle("lvHidden", hint === "");
    }

    // Draws the probes and leads (or the clamp) over the circuit; canvas
    // context in screen pixels.
    draw(ctx: CanvasRenderingContext2D): void {
        if (!this.open)
            return;
        this.refreshContacts();
        this.render();
        ctx.save();
        if (this.isAmps())
            this.drawClamp(ctx);
        else {
            const c = this.canvas.getBoundingClientRect();
            this.jacks.forEach((jack, i) => {
                const r = jack.getBoundingClientRect();
                const from = { x: r.left + r.width / 2 - c.left, y: r.top + r.height / 2 - c.top };
                this.drawProbe(ctx, i === 0 ? this.red : this.black, from, i === 0 ? RED : Theme.palette.ink);
            });
        }
        ctx.restore();
    }

    private drawProbe(ctx: CanvasRenderingContext2D, p: Probe, from: PointLike, color: string): void {
        const tip = this.toScreen(p.at);
        // the lead hangs a little between the meter and the tip
        const sag = Math.min(80, Math.hypot(tip.x - from.x, tip.y - from.y) * 0.25);
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.bezierCurveTo(from.x, from.y + sag, tip.x, tip.y + sag, tip.x, tip.y);
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.75;
        ctx.lineWidth = 2.5;
        ctx.stroke();
        ctx.globalAlpha = 1;

        ctx.beginPath();
        ctx.arc(tip.x, tip.y, 7, 0, 2 * Math.PI);
        ctx.fillStyle = p.contact ? color : Theme.palette.background;
        ctx.fill();
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = color;
        ctx.stroke();
        if (p === this.dragging) {
            const c = findContact(this.host.elements(), p.at, this.reach());
            if (c) {
                const s = this.toScreen(c.at);
                ctx.beginPath();
                ctx.arc(s.x, s.y, 11, 0, 2 * Math.PI);
                ctx.lineWidth = 2;
                ctx.strokeStyle = Theme.palette.select;
                ctx.stroke();
            }
        }
    }

    private drawClamp(ctx: CanvasRenderingContext2D): void {
        const t = this.clampTarget;
        if (t == null || !this.host.elements().includes(t))
            return;
        const a = this.toScreen({ x: t.x, y: t.y }), b = this.toScreen({ x: t.x2, y: t.y2 });
        const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        ctx.beginPath();
        ctx.ellipse(m.x, m.y, 16, 16, 0, 0.25 * Math.PI, 1.75 * Math.PI);
        ctx.lineWidth = 4;
        ctx.lineCap = "round";
        ctx.strokeStyle = RED;
        ctx.stroke();
    }

    // ---- interaction ----

    private parkProbes(): void {
        const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
        this.red = { at: this.toCircuit(w * 0.62, h * 0.5), contact: null };
        this.black = { at: this.toCircuit(w * 0.62 + 50, h * 0.5 + 30), contact: null };
        this.placed = true;
    }

    private local(e: PointerEvent): PointLike {
        const r = this.canvas.getBoundingClientRect();
        return { x: e.clientX - r.left, y: e.clientY - r.top };
    }

    private pointerDown(e: PointerEvent): void {
        if (!this.open || e.button !== 0 || e.target !== this.canvas)
            return;
        const s = this.local(e);
        if (this.isAmps()) {
            if (!this.picking)
                return;
            const target = this.partAt(this.toCircuit(s.x, s.y));
            e.preventDefault();
            e.stopPropagation();
            if (target != null) {
                this.clampTarget = target;
                this.picking = false;
                this.shown = NaN;
                this.resetWindow();
            }
            this.render();
            this.host.repaint();
            return;
        }
        const hit = [this.red, this.black].find((p) => {
            const t = this.toScreen(p.at);
            return Math.hypot(t.x - s.x, t.y - s.y) <= TIP_HIT_PX;
        });
        if (hit == null)
            return;
        e.preventDefault();
        e.stopPropagation();
        this.dragging = hit;
        hit.contact = null;
        const move = (ev: PointerEvent) => {
            const q = this.local(ev);
            hit.at = this.toCircuit(q.x, q.y);
            this.host.repaint();
        };
        const up = () => {
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", up);
            this.dragging = null;
            const c = findContact(this.host.elements(), hit.at, this.reach());
            hit.contact = c;
            if (c)
                hit.at = { ...c.at };
            this.shown = NaN;
            this.resetWindow();
            this.host.repaint();
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
    }

    // the smallest part whose box holds the point (wires included)
    private partAt(p: PointLike): any {
        let best: any = null, bestArea = Infinity;
        for (const ce of this.host.elements()) {
            const pad = 6;
            const x1 = Math.min(ce.x, ce.x2) - pad, x2 = Math.max(ce.x, ce.x2) + pad;
            const y1 = Math.min(ce.y, ce.y2) - pad, y2 = Math.max(ce.y, ce.y2) + pad;
            if (p.x < x1 || p.x > x2 || p.y < y1 || p.y > y2 || ce.getPostCount?.() !== 2)
                continue;
            const area = (x2 - x1) * (y2 - y1);
            if (area < bestArea) {
                bestArea = area;
                best = ce;
            }
        }
        return best;
    }

    private makeDraggable(handle: HTMLElement): void {
        handle.addEventListener("pointerdown", (e) => {
            if ((e.target as HTMLElement).closest("button"))
                return;
            e.preventDefault();
            const start = { x: e.clientX, y: e.clientY, left: this.panel.offsetLeft, top: this.panel.offsetTop };
            const move = (ev: PointerEvent) => {
                const maxX = this.container.clientWidth - this.panel.offsetWidth;
                const maxY = this.container.clientHeight - this.panel.offsetHeight;
                this.panel.style.left = Math.max(0, Math.min(maxX, start.left + ev.clientX - start.x)) + "px";
                this.panel.style.top = Math.max(0, Math.min(maxY, start.top + ev.clientY - start.y)) + "px";
                this.host.repaint();
            };
            const up = () => {
                window.removeEventListener("pointermove", move);
                window.removeEventListener("pointerup", up);
            };
            window.addEventListener("pointermove", move);
            window.addEventListener("pointerup", up);
        });
    }
}
