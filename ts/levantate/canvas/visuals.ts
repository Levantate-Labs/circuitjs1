/*
    Copyright (C) 2026 Levantate Labs

    This file is part of the Levantate Labs fork of CircuitJS1, distributed under
    the GNU General Public License, version 2 or (at your option) any later
    version. See COPYING.txt.
*/

// Figma-style canvas visuals (roadmap slice L1): dot grid, hover halo,
// selection bounds and selection box. Called from UIManager.updateCircuit().

import { Theme } from "../theme";

type Transform = number[];   // [scaleX, 0, 0, scaleY, translateX, translateY]
interface Box { x: number; y: number; width: number; height: number; }
interface Elm {
    x: number; y: number; x2: number; y2: number;
    isSelected(): boolean;
    getBoundingBox(): Box | null;
}

// Screen spacing (CSS px) below which a grid level is too dense to show.
const MIN_SPACING = 12;

// Dot grid in screen space, drawn right after the background fill. The grid
// spacing doubles as you zoom out; the dots that are about to disappear fade
// out first, so zooming never makes the grid jump.
export function drawDotGrid(ctx: CanvasRenderingContext2D, t: Transform,
                            width: number, height: number, baseStep: number): void {
    const z = t[0];
    let step = baseStep;
    while (step * z < MIN_SPACING)
        step *= 2;
    const s = step * z;
    // 0 when the fine level has just appeared (spacing MIN_SPACING), 1 at double that
    const fade = Math.max(0, Math.min(1, (s - MIN_SPACING) / MIN_SPACING));

    const i0 = Math.ceil(-t[4] / s);
    const j0 = Math.ceil(-t[5] / s);
    const coarse = new Path2D();   // dots on the next level up: always full strength
    const fine = new Path2D();     // the in-between dots: fade with zoom
    const r = 0.8;
    for (let i = i0; ; i++) {
        const x = t[4] + i * s;
        if (x > width)
            break;
        for (let j = j0; ; j++) {
            const y = t[5] + j * s;
            if (y > height)
                break;
            const path = (i % 2 === 0 && j % 2 === 0) ? coarse : fine;
            path.rect(x - r, y - r, 2 * r, 2 * r);
        }
    }
    ctx.save();
    ctx.fillStyle = Theme.palette.canvasDot;
    ctx.fill(coarse);
    if (fade > 0) {
        ctx.globalAlpha = fade;
        ctx.fill(fine);
    }
    ctx.restore();
}

function bounds(e: Elm): Box {
    const bb = e.getBoundingBox();
    let minx = Math.min(e.x, e.x2), maxx = Math.max(e.x, e.x2);
    let miny = Math.min(e.y, e.y2), maxy = Math.max(e.y, e.y2);
    if (bb != null) {
        minx = Math.min(minx, bb.x);
        maxx = Math.max(maxx, bb.x + bb.width);
        miny = Math.min(miny, bb.y);
        maxy = Math.max(maxy, bb.y + bb.height);
    }
    return { x: minx, y: miny, width: maxx - minx, height: maxy - miny };
}

// Soft halo behind the part under the cursor (circuit coordinates, drawn
// before the parts so it sits underneath them).
export function drawHoverHalo(ctx: CanvasRenderingContext2D, elm: Elm, scale: number): void {
    const b = bounds(elm);
    const pad = 8;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(b.x - pad, b.y - pad, b.width + 2 * pad, b.height + 2 * pad, 8);
    ctx.globalAlpha = 0.10;
    ctx.fillStyle = Theme.palette.select;
    ctx.fill();
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 1 / scale;
    ctx.strokeStyle = Theme.palette.select;
    ctx.stroke();
    ctx.restore();
}

// One rectangle around everything selected (circuit coordinates).
export function drawSelectionBounds(ctx: CanvasRenderingContext2D, elms: Elm[], scale: number): void {
    let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    for (const e of elms) {
        if (!e.isSelected())
            continue;
        const b = bounds(e);
        minx = Math.min(minx, b.x);
        miny = Math.min(miny, b.y);
        maxx = Math.max(maxx, b.x + b.width);
        maxy = Math.max(maxy, b.y + b.height);
    }
    if (minx > maxx)
        return;
    const pad = 10;
    ctx.save();
    ctx.lineWidth = 1.25 / scale;
    ctx.strokeStyle = Theme.palette.select;
    // no corner handles: parts can't be resized by dragging the selection box
    ctx.strokeRect(minx - pad, miny - pad, maxx - minx + 2 * pad, maxy - miny + 2 * pad);
    ctx.restore();
}

// Box selection: tinted fill and a crisp 1px outline (circuit coordinates).
export function drawSelectionBox(ctx: CanvasRenderingContext2D, area: Box, scale: number): void {
    ctx.save();
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = Theme.palette.select;
    ctx.fillRect(area.x, area.y, area.width, area.height);
    ctx.globalAlpha = 1;
    ctx.lineWidth = 1 / scale;
    ctx.strokeStyle = Theme.palette.select;
    ctx.strokeRect(area.x, area.y, area.width, area.height);
    ctx.restore();
}
