/*
    Copyright (C) 2026 Levantate Labs

    This file is part of the Levantate Labs fork of CircuitJS1, distributed under
    the GNU General Public License, version 2 or (at your option) any later
    version. See COPYING.txt.
*/

// A pair of test leads (red and black) for an instrument: tips the student
// drags onto the circuit, drawn as cables from the instrument panel's jacks.
// Used by the multimeter, function generator and bench supply.

import { Theme } from "../theme";
import { findContact, type MeterElm, type PointLike, type ProbeContact } from "./meterLogic";

export interface LeadsHost {
    transform(): number[];          // [scale, 0, 0, scale, tx, ty]: circuit to canvas pixels
    elements(): any[];
    repaint(): void;
}

export interface Probe {
    at: PointLike;                  // circuit coordinates
    contact: ProbeContact | null;
}

export const RED = "#e5484d";
const TIP_HIT_PX = 14;              // grab a tip within this many screen pixels
const CONTACT_REACH_PX = 14;        // a dropped tip touches things within this many pixels

// Instruments' own hidden parts are never something a lead can touch.
const touchable = (elms: any[]): MeterElm[] => elms.filter((e) => !e.levInstrument);

export class ProbeLeads {
    red: Probe = { at: { x: 0, y: 0 }, contact: null };
    black: Probe = { at: { x: 0, y: 0 }, contact: null };
    private dragging: Probe | null = null;
    private placed = false;

    constructor(private readonly host: LeadsHost, private readonly canvas: HTMLCanvasElement,
                private readonly opts: { postsOnly?: boolean; park: PointLike; onChange: () => void }) {}

    get attached(): boolean { return this.red.contact != null && this.black.contact != null; }

    // first time the instrument opens: tips near the middle of the canvas
    parkIfNew(): void {
        if (this.placed)
            return;
        const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
        const p = this.opts.park;
        this.red = { at: this.toCircuit(w * p.x, h * p.y), contact: null };
        this.black = { at: this.toCircuit(w * p.x + 50, h * p.y + 30), contact: null };
        this.placed = true;
    }

    toScreen(p: PointLike): PointLike {
        const t = this.host.transform();
        return { x: p.x * t[0] + t[4], y: p.y * t[3] + t[5] };
    }

    toCircuit(sx: number, sy: number): PointLike {
        const t = this.host.transform();
        return { x: (sx - t[4]) / t[0], y: (sy - t[5]) / t[3] };
    }

    private reach(): number {
        return CONTACT_REACH_PX / this.host.transform()[0];
    }

    private find(p: PointLike, reach: number): ProbeContact | null {
        return findContact(touchable(this.host.elements()), p, reach, this.opts.postsOnly);
    }

    // Once a frame: re-find what each tip touches (parts may have moved or gone).
    refresh(): void {
        for (const p of [this.red, this.black]) {
            if (p === this.dragging)
                continue;
            const before = p.contact;
            p.contact = this.find(p.at, this.reach() * 0.5);
            if (p.contact)
                p.at = { ...p.contact.at };
            if (!sameContact(before, p.contact))
                this.opts.onChange();
        }
    }

    sameNode(): boolean {
        const r = this.red.contact, b = this.black.contact;
        const n = (c: ProbeContact) => (c.elm as any).nodes?.[c.post];
        return r != null && b != null && n(r) != null && n(r) === n(b);
    }

    // Starts dragging a tip under the pointer; true when it took the event.
    pointerDown(e: PointerEvent): boolean {
        const r = this.canvas.getBoundingClientRect();
        const s = { x: e.clientX - r.left, y: e.clientY - r.top };
        const hit = [this.red, this.black].find((p) => {
            const t = this.toScreen(p.at);
            return Math.hypot(t.x - s.x, t.y - s.y) <= TIP_HIT_PX;
        });
        if (hit == null)
            return false;
        e.preventDefault();
        e.stopPropagation();
        this.dragging = hit;
        hit.contact = null;
        this.opts.onChange();
        const move = (ev: PointerEvent) => {
            hit.at = this.toCircuit(ev.clientX - r.left, ev.clientY - r.top);
            this.host.repaint();
        };
        const up = () => {
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", up);
            this.dragging = null;
            hit.contact = this.find(hit.at, this.reach());
            if (hit.contact)
                hit.at = { ...hit.contact.at };
            this.opts.onChange();
            this.host.repaint();
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
        return true;
    }

    // Cables from the panel's two jacks to the tips; context in screen pixels.
    draw(ctx: CanvasRenderingContext2D, jacks: HTMLElement[]): void {
        const c = this.canvas.getBoundingClientRect();
        jacks.forEach((jack, i) => {
            const r = jack.getBoundingClientRect();
            const from = { x: r.left + r.width / 2 - c.left, y: r.top + r.height / 2 - c.top };
            this.drawLead(ctx, i === 0 ? this.red : this.black, from, i === 0 ? RED : Theme.palette.ink);
        });
    }

    private drawLead(ctx: CanvasRenderingContext2D, p: Probe, from: PointLike, color: string): void {
        const tip = this.toScreen(p.at);
        const sag = Math.min(80, Math.hypot(tip.x - from.x, tip.y - from.y) * 0.25);
        ctx.save();
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
            const c = this.find(p.at, this.reach());
            if (c) {
                const s = this.toScreen(c.at);
                ctx.beginPath();
                ctx.arc(s.x, s.y, 11, 0, 2 * Math.PI);
                ctx.lineWidth = 2;
                ctx.strokeStyle = Theme.palette.select;
                ctx.stroke();
            }
        }
        ctx.restore();
    }
}

function sameContact(a: ProbeContact | null, b: ProbeContact | null): boolean {
    if (a == null || b == null)
        return a === b;
    return a.elm === b.elm && a.post === b.post && a.at.x === b.at.x && a.at.y === b.at.y;
}

// Opens a panel in the first free spot (left to right, then down) that
// doesn't cover another open instrument, unless the student has moved it.
export function placePanel(panel: HTMLElement, container: HTMLElement): void {
    if (panel.dataset.moved)
        return;
    const others = Array.from(container.querySelectorAll<HTMLElement>(".lvMeter, .lvInstr"))
        .filter((p) => p !== panel && !p.classList.contains("lvHidden"))
        .map((p) => ({ x: p.offsetLeft, y: p.offsetTop, w: p.offsetWidth, h: p.offsetHeight }));
    const w = panel.offsetWidth, h = panel.offsetHeight, gap = 12;
    const maxX = container.clientWidth - w - gap;
    const free = (x: number, y: number) =>
        others.every((o) => x + w + gap <= o.x || o.x + o.w + gap <= x || y + h + gap <= o.y || o.y + o.h + gap <= y);
    for (let y = 64; y + h <= container.clientHeight; y += 40)
        for (let x = 16; x <= Math.max(16, maxX); x += 28)
            if (free(x, y)) {
                panel.style.left = x + "px";
                panel.style.top = y + "px";
                return;
            }
    // no room: cascade over the others
    panel.style.left = 16 + 24 * others.length + "px";
    panel.style.top = 64 + 24 * others.length + "px";
}

// Makes an instrument panel draggable by its header, inside its container.
// (A moved panel keeps its place when reopened.)
export function makePanelDraggable(panel: HTMLElement, handle: HTMLElement, container: HTMLElement, repaint: () => void): void {
    handle.addEventListener("pointerdown", (e) => {
        if ((e.target as HTMLElement).closest("button, input, select"))
            return;
        e.preventDefault();
        const start = { x: e.clientX, y: e.clientY, left: panel.offsetLeft, top: panel.offsetTop };
        panel.dataset.moved = "1";
        const move = (ev: PointerEvent) => {
            const maxX = container.clientWidth - panel.offsetWidth;
            const maxY = container.clientHeight - panel.offsetHeight;
            panel.style.left = Math.max(0, Math.min(maxX, start.left + ev.clientX - start.x)) + "px";
            panel.style.top = Math.max(0, Math.min(maxY, start.top + ev.clientY - start.y)) + "px";
            repaint();
        };
        const up = () => {
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", up);
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
    });
}
