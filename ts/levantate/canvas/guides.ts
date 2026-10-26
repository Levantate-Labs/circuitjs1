/*
    Copyright (C) 2026 Levantate Labs

    This file is part of the Levantate Labs fork of CircuitJS1, distributed under
    the GNU General Public License, version 2 or (at your option) any later
    version. See COPYING.txt.
*/

// Alignment guides and distance readout (roadmap slice L7). While parts are
// dragged, placed or rewired, a dashed guide shows every terminal of the moving
// parts that lines up (same x or y) with a terminal of a part that stays put,
// and a small readout near the cursor shows how far the drag has gone.
// Positions already snap to the grid, so guides confirm alignment rather than
// pulling parts around.

import { Theme } from "../theme";

interface Pt { x: number; y: number; }
interface Elm {
    getPostCount(): number;
    getPost(n: number): Pt | null;
    isSelected(): boolean;
}

export interface Guide {
    vertical: boolean;   // true: line at x = pos; false: line at y = pos
    pos: number;
    from: number;        // span along the line, covering the aligned terminals
    to: number;
}

function posts(e: Elm, only?: number): Pt[] {
    const out: Pt[] = [];
    for (let i = 0; i < e.getPostCount(); i++) {
        if (only !== undefined && i !== only)
            continue;
        const p = e.getPost(i);
        if (p != null)
            out.push(p);
    }
    return out;
}

// Guides for the terminals in `moving` against every terminal of `fixed`.
export function findGuides(moving: Pt[], fixed: Pt[]): Guide[] {
    const vertical = new Map<number, { from: number; to: number }>();
    const horizontal = new Map<number, { from: number; to: number }>();
    const grow = (m: Map<number, { from: number; to: number }>, pos: number, a: number, b: number) => {
        const g = m.get(pos);
        const lo = Math.min(a, b), hi = Math.max(a, b);
        if (g == null)
            m.set(pos, { from: lo, to: hi });
        else {
            g.from = Math.min(g.from, lo);
            g.to = Math.max(g.to, hi);
        }
    };
    for (const m of moving) {
        for (const f of fixed) {
            if (f.x === m.x && f.y !== m.y)
                grow(vertical, m.x, m.y, f.y);
            if (f.y === m.y && f.x !== m.x)
                grow(horizontal, m.y, m.x, f.x);
        }
    }
    const out: Guide[] = [];
    for (const [pos, s] of vertical) out.push({ vertical: true, pos, ...s });
    for (const [pos, s] of horizontal) out.push({ vertical: false, pos, ...s });
    return out;
}

export type DragKind = "selection" | "place" | "post";

// Terminals that are moving in the current drag, and the ones that aren't.
// `alsoMoving`: parts being dragged without being selected (upstream selects the
// part under the cursor only for the instant of each move).
export function splitPosts(elms: Elm[], kind: DragKind, dragElm: Elm | null,
                           postElm: Elm | null, postIndex: number,
                           alsoMoving: ReadonlySet<Elm> = new Set()): { moving: Pt[]; fixed: Pt[] } {
    const moving: Pt[] = [];
    const fixed: Pt[] = [];
    for (const e of elms) {
        if (kind === "selection" && (e.isSelected() || alsoMoving.has(e)))
            moving.push(...posts(e));
        else if (kind === "post" && e === postElm) {
            moving.push(...posts(e, postIndex));
            // the part's other terminal stays where it is
            fixed.push(...posts(e).filter((_, i) => i !== postIndex));
        } else
            fixed.push(...posts(e));
    }
    if (kind === "place" && dragElm != null)
        moving.push(...posts(dragElm));
    return { moving, fixed };
}

// Draw guides in circuit coordinates (the canvas already has the view transform).
export function drawGuides(ctx: CanvasRenderingContext2D, guides: Guide[], scale: number): void {
    if (guides.length === 0)
        return;
    const pad = 24;
    ctx.save();
    ctx.lineWidth = 1 / scale;
    ctx.setLineDash([4 / scale, 3 / scale]);
    ctx.strokeStyle = Theme.palette.guide;
    ctx.beginPath();
    for (const g of guides) {
        if (g.vertical) {
            ctx.moveTo(g.pos, g.from - pad);
            ctx.lineTo(g.pos, g.to + pad);
        } else {
            ctx.moveTo(g.from - pad, g.pos);
            ctx.lineTo(g.to + pad, g.pos);
        }
    }
    ctx.stroke();
    ctx.restore();
}

// Readout pill near the cursor (screen coordinates), e.g. "→ 3  ↓ 2" in grid
// squares, or the length of a part being placed.
export function drawReadout(ctx: CanvasRenderingContext2D, text: string, x: number, y: number): void {
    const pal = Theme.palette;
    ctx.save();
    ctx.font = "600 11px 'Plus Jakarta Sans Variable', system-ui, sans-serif";
    const w = ctx.measureText(text).width + 14;
    const h = 20;
    const bx = x + 14, by = y + 16;
    ctx.beginPath();
    ctx.roundRect(bx, by, w, h, h / 2);
    ctx.fillStyle = pal.guide;
    ctx.fill();
    ctx.fillStyle = pal.guideText;
    ctx.textBaseline = "middle";
    ctx.fillText(text, bx + 7, by + h / 2 + 0.5);
    ctx.restore();
}

export function moveText(dxCells: number, dyCells: number): string {
    const h = dxCells === 0 ? "" : (dxCells > 0 ? "→ " : "← ") + Math.abs(dxCells);
    const v = dyCells === 0 ? "" : (dyCells > 0 ? "↓ " : "↑ ") + Math.abs(dyCells);
    return [h, v].filter(Boolean).join("  ") || "0";
}
