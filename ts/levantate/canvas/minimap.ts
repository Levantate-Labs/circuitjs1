/*
    Copyright (C) 2026 Levantate Labs

    This file is part of the Levantate Labs fork of CircuitJS1, distributed under
    the GNU General Public License, version 2 or (at your option) any later
    version. See COPYING.txt.
*/

// Minimap (roadmap slice L7): a small overview in the bottom-left corner of the
// canvas showing the whole circuit and the part of it in view. Click or drag on
// it to move the view. It only appears when part of the circuit is off-screen.

import { Theme } from "../theme";

interface Rect { x: number; y: number; width: number; height: number; }
interface Elm { x: number; y: number; x2: number; y2: number; }

export interface MinimapHost {
    enabled(): boolean;
    transform: number[];                 // [scale, 0, 0, scale, tx, ty]
    circuitArea: Rect;                   // visible circuit area, canvas CSS px
    canvasHeight(): number;
    elms(): Elm[];
    contentBounds(): Rect | null;        // whole circuit, circuit coordinates
    repaint(): void;
}

const W = 184, H = 124, PAD = 12;

export class Minimap {
    private readonly cv: HTMLCanvasElement;
    private readonly ctx: CanvasRenderingContext2D;
    private signature = "";
    // world → minimap mapping from the last draw, used by clicks
    private map = { scale: 1, ox: 0, oy: 0 };

    constructor(private readonly host: MinimapHost, container: HTMLElement) {
        const dpr = window.devicePixelRatio || 1;
        this.cv = document.createElement("canvas");
        this.cv.className = "minimap lvHidden";
        this.cv.width = Math.round(W * dpr);
        this.cv.height = Math.round(H * dpr);
        this.cv.style.width = W + "px";
        this.cv.style.height = H + "px";
        this.cv.setAttribute("role", "img");
        this.cv.setAttribute("aria-label", "Circuit overview: click to move the view");
        this.ctx = this.cv.getContext("2d")!;
        this.ctx.scale(dpr, dpr);
        container.appendChild(this.cv);

        const jump = (e: PointerEvent) => {
            const r = this.cv.getBoundingClientRect();
            const wx = (e.clientX - r.left - this.map.ox) / this.map.scale;
            const wy = (e.clientY - r.top - this.map.oy) / this.map.scale;
            const t = this.host.transform, a = this.host.circuitArea;
            t[4] = a.width / 2 - wx * t[0];
            t[5] = a.height / 2 - wy * t[3];
            this.host.repaint();
        };
        this.cv.addEventListener("pointerdown", (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.cv.setPointerCapture(e.pointerId);
            jump(e);
        });
        this.cv.addEventListener("pointermove", (e) => {
            if (this.cv.hasPointerCapture(e.pointerId))
                jump(e);
        });
    }

    // Called once per frame; redraws only when something it shows has changed.
    update(): void {
        const host = this.host;
        const content = host.contentBounds();
        const t = host.transform, a = host.circuitArea;
        const view: Rect = { x: -t[4] / t[0], y: -t[5] / t[3], width: a.width / t[0], height: a.height / t[3] };
        const offscreen = content != null && (content.x < view.x || content.y < view.y ||
            content.x + content.width > view.x + view.width || content.y + content.height > view.y + view.height);
        const show = host.enabled() && offscreen;
        this.cv.classList.toggle("lvHidden", !show);
        // sit just above the scopes strip
        this.cv.style.bottom = (host.canvasHeight() - a.height + 12) + "px";
        if (!show || content == null)
            return;

        const elms = host.elms();
        let elmSig = elms.length + ":";
        for (let i = 0; i < elms.length; i += Math.max(1, Math.floor(elms.length / 32)))
            elmSig += elms[i].x + "," + elms[i].y + "," + elms[i].x2 + "," + elms[i].y2 + ";";
        const sig = [view.x, view.y, view.width, view.height, content.x, content.y, content.width,
            content.height, Theme.light, elmSig].join("|");
        if (sig === this.signature)
            return;
        this.signature = sig;
        this.draw(elms, content, view);
    }

    private draw(elms: Elm[], content: Rect, view: Rect): void {
        const pal = Theme.palette;
        const ctx = this.ctx;
        // fit the circuit and the view together
        const x0 = Math.min(content.x, view.x), y0 = Math.min(content.y, view.y);
        const x1 = Math.max(content.x + content.width, view.x + view.width);
        const y1 = Math.max(content.y + content.height, view.y + view.height);
        const scale = Math.min((W - 2 * PAD) / Math.max(1, x1 - x0), (H - 2 * PAD) / Math.max(1, y1 - y0));
        const ox = (W - (x1 - x0) * scale) / 2 - x0 * scale;
        const oy = (H - (y1 - y0) * scale) / 2 - y0 * scale;
        this.map = { scale, ox, oy };

        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = pal.minimapBg;
        ctx.beginPath();
        ctx.roundRect(0.5, 0.5, W - 1, H - 1, 10);
        ctx.fill();

        ctx.beginPath();
        for (const e of elms) {
            ctx.moveTo(e.x * scale + ox, e.y * scale + oy);
            ctx.lineTo(e.x2 * scale + ox, e.y2 * scale + oy);
        }
        ctx.lineWidth = 1.25;
        ctx.lineCap = "round";
        ctx.strokeStyle = pal.minimapInk;
        ctx.stroke();

        const vx = view.x * scale + ox, vy = view.y * scale + oy;
        ctx.fillStyle = pal.select;
        ctx.globalAlpha = 0.10;
        ctx.fillRect(vx, vy, view.width * scale, view.height * scale);
        ctx.globalAlpha = 1;
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = pal.select;
        ctx.strokeRect(vx, vy, view.width * scale, view.height * scale);
    }
}
