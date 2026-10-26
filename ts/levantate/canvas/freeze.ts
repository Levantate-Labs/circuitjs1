/*
    Copyright (C) 2026 Levantate Labs

    This file is part of the Levantate Labs fork of CircuitJS1, distributed under
    the GNU General Public License, version 2 or (at your option) any later
    version. See COPYING.txt.
*/

// Freeze and inspect: stop the simulation at an instant and label the circuit
// with what is happening at that instant - the current through each part (with
// its direction), the direction of current in the wires and the voltage at each
// node. Scopes stop with it, so the waveforms show the same moment. Running,
// resetting or editing the circuit ends the freeze (the labels would be stale).

import { Theme } from "../theme";

export interface FreezeHost {
    setRunning(on: boolean): void;
    timeText(): string;
    repaint(): void;
}

// what the overlay needs from a circuit element (CircuitElm satisfies it)
export interface FreezeElm {
    x: number; y: number; x2: number; y2: number;
    nodes?: { v: number; internal: boolean }[];
    getPostCount(): number;
    getPost(n: number): { x: number; y: number } | null;
    getCurrent(): number;
    isWireEquivalent(): boolean;
    isRemovableWire(): boolean;
    isRoutedWireElm(): boolean;
    isCreating?(): boolean;
}

export interface FreezeFormat {
    current(i: number): string;   // magnitude, e.g. "2.5 mA"
    voltage(v: number): string;   // e.g. "-1.2 V"
}

export interface Rect { x: number; y: number; w: number; h: number; }

const SNOWFLAKE = "<svg viewBox='0 0 24 24' width='16' height='16' fill='none' stroke='currentColor' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'><path d='M12 2v20M3.3 7l17.4 10M3.3 17L20.7 7'/><path d='M9.5 3.5L12 6l2.5-2.5M9.5 20.5L12 18l2.5 2.5M3.8 10.4l3.4-.9-.9-3.4M20.2 13.6l-3.4.9.9 3.4M3.8 13.6l3.4.9-.9 3.4M20.2 10.4l-3.4-.9.9-3.4'/></svg>";

// currents and voltages this small are numerical noise, not something to show
const MIN_CURRENT = 1e-9;
const MIN_VOLTAGE = 1e-6;

export class Freeze {
    static active = false;
    showCurrents = true;
    showVoltages = true;
    private readonly bar: HTMLElement;
    private readonly time: HTMLElement;

    constructor(private readonly host: FreezeHost, container: HTMLElement) {
        this.bar = document.createElement("div");
        this.bar.className = "freezeBar lvHidden";
        this.bar.setAttribute("role", "status");
        this.bar.innerHTML = SNOWFLAKE;
        this.time = document.createElement("span");
        this.time.className = "freezeTime";
        this.bar.appendChild(this.time);
        this.bar.appendChild(this.toggle("Currents", () => this.showCurrents, (v) => this.showCurrents = v));
        this.bar.appendChild(this.toggle("Voltages", () => this.showVoltages, (v) => this.showVoltages = v));
        const resume = document.createElement("button");
        resume.type = "button";
        resume.className = "freezeResume";
        resume.textContent = "Resume";
        resume.addEventListener("click", () => this.host.setRunning(true));
        this.bar.appendChild(resume);
        container.appendChild(this.bar);
    }

    private toggle(label: string, get: () => boolean, set: (v: boolean) => void): HTMLElement {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "freezeToggle";
        b.textContent = label;
        const sync = () => {
            b.classList.toggle("on", get());
            b.setAttribute("aria-pressed", String(get()));
        };
        b.addEventListener("click", () => { set(!get()); sync(); this.host.repaint(); });
        sync();
        return b;
    }

    freeze(): void {
        this.host.setRunning(false);
        Freeze.active = true;
        this.time.textContent = "Frozen at t = " + this.host.timeText();
        this.bar.classList.remove("lvHidden");
        this.host.repaint();
    }

    release(): void {
        if (!Freeze.active)
            return;
        Freeze.active = false;
        this.bar.classList.add("lvHidden");
        this.host.repaint();
    }
}

// ---- overlay ----

export function overlaps(a: Rect, b: Rect): boolean {
    return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

// Unit normal to a segment, on the side away from upstream's value text:
// below a horizontal part, right of a vertical one.
export function labelNormal(dx: number, dy: number): { x: number; y: number } {
    const len = Math.hypot(dx, dy) || 1;
    let nx = -dy / len, ny = dx / len;
    if (ny < -0.01 || (Math.abs(ny) <= 0.01 && nx < 0)) {
        nx = -nx; ny = -ny;
    }
    return { x: nx, y: ny };
}

// Screen rectangles (relative to the canvas) of the controls floating over it
// (freeze bar, zoom pill, dock, minimap), for labels to keep clear of.
export function floatingRects(canvas: HTMLElement): Rect[] {
    const c = canvas.getBoundingClientRect();
    const out: Rect[] = [];
    for (const el of Array.from(canvas.parentElement?.children ?? [])) {
        if (el === canvas)
            continue;
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0)
            out.push({ x: r.left - c.left - 4, y: r.top - c.top - 4, w: r.width + 8, h: r.height + 8 });
    }
    return out;
}

// Draws the frozen-instant labels in screen space. transform is the app's
// [scale, 0, 0, scale, tx, ty] circuit-to-screen transform; labels avoid the
// avoid rectangles where they can.
export function drawFreezeOverlay(ctx: CanvasRenderingContext2D, elms: FreezeElm[], transform: number[],
                                  fmt: FreezeFormat, show: { currents: boolean; voltages: boolean },
                                  avoid: Rect[] = []): void {
    const pal = Theme.palette;
    const sx = (x: number) => x * transform[0] + transform[4];
    const sy = (y: number) => y * transform[3] + transform[5];
    const placed: Rect[] = [...avoid];
    ctx.save();
    ctx.font = "600 11px 'Plus Jakarta Sans Variable', system-ui, sans-serif";
    ctx.textBaseline = "middle";

    if (show.currents) {
        // wires: an arrowhead in the middle of each wire carrying current
        for (const ce of elms) {
            if (!ce.isRemovableWire() || ce.isRoutedWireElm() || ce.isCreating?.())
                continue;
            const i = ce.getCurrent();
            const x1 = sx(ce.x), y1 = sy(ce.y), x2 = sx(ce.x2), y2 = sy(ce.y2);
            const len = Math.hypot(x2 - x1, y2 - y1);
            if (!(Math.abs(i) > MIN_CURRENT) || len < 36)
                continue;
            const s = Math.sign(i);
            drawArrowHead(ctx, (x1 + x2) / 2, (y1 + y2) / 2, s * (x2 - x1) / len, s * (y2 - y1) / len, 6, pal.current);
        }
        // parts: a label with the current and its direction
        for (const ce of elms) {
            if (ce.getPostCount() !== 2 || ce.isWireEquivalent() || ce.isRemovableWire() || ce.isCreating?.())
                continue;
            const i = ce.getCurrent();
            if (!(Math.abs(i) > MIN_CURRENT))
                continue;
            const p1 = ce.getPost(0), p2 = ce.getPost(1);
            if (p1 == null || p2 == null)
                continue;
            const x1 = sx(p1.x), y1 = sy(p1.y), x2 = sx(p2.x), y2 = sy(p2.y);
            const len = Math.hypot(x2 - x1, y2 - y1);
            if (len < 1)
                continue;
            // positive current flows from post 0 to post 1 through the part
            const s = Math.sign(i);
            const dx = s * (x2 - x1) / len, dy = s * (y2 - y1) / len;
            const text = fmt.current(i);
            const w = ctx.measureText(text).width + 30, h = 20;
            const n = labelNormal(x2 - x1, y2 - y1);
            const off = Math.max(18, 10 * transform[0]) + h / 2;
            const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
            const r = place([1, -1].map((k) => centred(mx + k * n.x * (off + w / 2 * Math.abs(n.x)),
                                                        my + k * n.y * off, w, h)), placed);
            pill(ctx, r, pal.scopeBg, pal.current);
            drawArrowHead(ctx, r.x + 13, r.y + h / 2, dx, dy, 4.5, pal.current, true);
            ctx.fillStyle = pal.ink;
            ctx.fillText(text, r.x + 22, r.y + h / 2 + 0.5);
        }
    }

    if (show.voltages) {
        // one chip per node, at a part's terminal where there is one
        const seen = new Set<object>();
        const order = [...elms.filter((e) => !e.isRemovableWire()), ...elms.filter((e) => e.isRemovableWire())];
        for (const ce of order) {
            if (ce.nodes == null || ce.isCreating?.())
                continue;
            for (let k = 0; k < ce.getPostCount(); k++) {
                const node = ce.nodes[k];
                const p = ce.getPost(k);
                if (node == null || p == null || node.internal || seen.has(node))
                    continue;
                seen.add(node);
                if (Math.abs(node.v) < MIN_VOLTAGE)
                    continue;   // ground and 0 V nodes stay unlabelled
                const text = fmt.voltage(node.v);
                const w = ctx.measureText(text).width + 14, h = 18;
                const px = sx(p.x), py = sy(p.y);
                const r = place([
                    { x: px + 6, y: py - h - 6, w, h }, { x: px - w - 6, y: py - h - 6, w, h },
                    { x: px + 6, y: py + 6, w, h }, { x: px - w - 6, y: py + 6, w, h },
                ], placed);
                const c = node.v > 0 ? pal.positive : pal.negative;
                pill(ctx, r, pal.scopeBg, c);
                ctx.fillStyle = c;
                ctx.fillText(text, r.x + 7, r.y + h / 2 + 0.5);
            }
        }
    }
    ctx.restore();
}

function centred(cx: number, cy: number, w: number, h: number): Rect {
    return { x: cx - w / 2, y: cy - h / 2, w, h };
}

// first candidate that doesn't cover an earlier label (else the first)
function place(candidates: Rect[], placed: Rect[]): Rect {
    const r = candidates.find((c) => !placed.some((p) => overlaps(c, p))) ?? candidates[0];
    placed.push(r);
    return r;
}

function pill(ctx: CanvasRenderingContext2D, r: Rect, fill: string, stroke: string): void {
    ctx.beginPath();
    ctx.roundRect(r.x, r.y, r.w, r.h, r.h / 2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = stroke;
    ctx.stroke();
}

// arrow pointing along (dx, dy); with a shaft when stem is set
function drawArrowHead(ctx: CanvasRenderingContext2D, x: number, y: number, dx: number, dy: number,
                       size: number, color: string, stem = false): void {
    const px = -dy, py = dx;
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    if (stem) {
        ctx.beginPath();
        ctx.lineWidth = 1.6;
        ctx.moveTo(x - dx * size * 1.4, y - dy * size * 1.4);
        ctx.lineTo(x + dx * size * 0.4, y + dy * size * 0.4);
        ctx.stroke();
        x += dx * size * 0.6;
        y += dy * size * 0.6;
    }
    ctx.beginPath();
    ctx.moveTo(x + dx * size, y + dy * size);
    ctx.lineTo(x - dx * size + px * size * 0.8, y - dy * size + py * size * 0.8);
    ctx.lineTo(x - dx * size - px * size * 0.8, y - dy * size - py * size * 0.8);
    ctx.closePath();
    if (!stem) {
        // ring in the canvas colour so the arrow reads on top of a wire
        ctx.lineWidth = 3;
        ctx.lineJoin = "round";
        ctx.strokeStyle = Theme.palette.background;
        ctx.stroke();
    }
    ctx.fill();
}
