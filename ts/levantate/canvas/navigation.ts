/*
    Copyright (C) 2026 Levantate Labs

    This file is part of the Levantate Labs fork of CircuitJS1, distributed under
    the GNU General Public License, version 2 or (at your option) any later
    version. See COPYING.txt.
*/

// Figma-style canvas navigation, layered in front of MouseManager:
//  - scroll pans, Ctrl/Cmd+scroll or trackpad pinch zooms towards the cursor
//  - Space+drag and middle-drag pan
//  - Shift+1 zoom to fit, Shift+2 zoom to selection, Ctrl/Cmd+0/+/- zoom
//  - a zoom pill (top right of the canvas) showing and setting the zoom level
// Anything this layer doesn't handle falls through to the upstream handlers.

import { CirSim } from "../../CirSim";
import { Locale } from "../../Locale";

export class CanvasNavigation {
    static readonly MIN_SCALE = 0.1;
    static readonly MAX_SCALE = 8;
    static readonly ZOOM_STEPS = [0.1, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 6, 8];

    static instance: CanvasNavigation | null = null;

    private readonly app: CirSim;
    private readonly canvas: HTMLCanvasElement;

    private spaceHeld = false;
    private panning = false;
    private panLastX = 0;
    private panLastY = 0;
    private lastWheelPan = 0;   // time of the last scroll-to-pan, so a pan isn't hijacked by value editing

    private pill: HTMLElement | null = null;
    private pillLabel: HTMLButtonElement | null = null;
    private pillMenu: HTMLElement | null = null;
    private shownScale = -1;

    private constructor(app: CirSim, canvas: HTMLCanvasElement) {
        this.app = app;
        this.canvas = canvas;
    }

    // Called from MouseManager.register() before the upstream listeners are added.
    static install(app: CirSim, canvas: HTMLCanvasElement): CanvasNavigation {
        const nav = new CanvasNavigation(app, canvas);
        CanvasNavigation.instance = nav;
        // capture listeners on the canvas run before MouseManager's own listeners
        canvas.addEventListener("wheel", (e) => nav.onWheel(e), { passive: false, capture: true });
        canvas.addEventListener("mousedown", (e) => nav.onMouseDown(e), { capture: true });
        window.addEventListener("mousemove", (e) => nav.onMouseMove(e));
        window.addEventListener("mouseup", () => nav.endPan());
        window.addEventListener("blur", () => { nav.spaceHeld = false; nav.endPan(); nav.updateCursor(); });
        // capture on window so these win over UIManager's document-level key handlers
        window.addEventListener("keydown", (e) => nav.onKeyDown(e), { capture: true });
        window.addEventListener("keyup", (e) => nav.onKeyUp(e), { capture: true });
        window.addEventListener("keypress", (e) => nav.onKeyPress(e), { capture: true });
        return nav;
    }

    // ---- zoom and pan primitives (canvas CSS pixels) ----

    get scale(): number { return this.app.transform[0]; }

    setScale(newScale: number, cx: number, cy: number): void {
        const t = this.app.transform;
        newScale = Math.min(CanvasNavigation.MAX_SCALE, Math.max(CanvasNavigation.MIN_SCALE, newScale));
        const oldScale = t[0];
        if (oldScale === newScale)
            return;
        // keep the circuit point under (cx, cy) fixed
        const wx = (cx - t[4]) / oldScale;
        const wy = (cy - t[5]) / oldScale;
        t[0] = t[3] = newScale;
        t[4] = cx - wx * newScale;
        t[5] = cy - wy * newScale;
        this.app.repaint();
    }

    zoomAt(factor: number, cx: number, cy: number): void {
        this.setScale(this.scale * factor, cx, cy);
    }

    private centre(): [number, number] {
        const a = this.app.circuitArea;
        return [a.x + a.width / 2, a.y + a.height / 2];
    }

    // step to the next/previous preset level, like Figma's Ctrl +/-
    zoomStep(direction: 1 | -1): void {
        const s = this.scale;
        const steps = CanvasNavigation.ZOOM_STEPS;
        let target = direction > 0
            ? steps.find((v) => v > s * 1.001)
            : [...steps].reverse().find((v) => v < s * 0.999);
        if (target === undefined)
            target = direction > 0 ? CanvasNavigation.MAX_SCALE : CanvasNavigation.MIN_SCALE;
        const [cx, cy] = this.centre();
        this.setScale(target, cx, cy);
    }

    zoomTo(level: number): void {
        const [cx, cy] = this.centre();
        this.setScale(level, cx, cy);
    }

    panBy(dx: number, dy: number): void {
        if (dx === 0 && dy === 0)
            return;
        this.app.transform[4] += dx;
        this.app.transform[5] += dy;
        this.app.repaint();
    }

    zoomToFit(): void {
        this.app.centerCircuit();
        this.app.repaint();
    }

    zoomToSelection(): void {
        let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
        for (const ce of this.app.elmList) {
            if (!ce.isSelected())
                continue;
            minx = Math.min(minx, ce.x, ce.x2);
            maxx = Math.max(maxx, ce.x, ce.x2);
            miny = Math.min(miny, ce.y, ce.y2);
            maxy = Math.max(maxy, ce.y, ce.y2);
            const bb = ce.getBoundingBox();
            if (bb != null) {
                minx = Math.min(minx, bb.x);
                maxx = Math.max(maxx, bb.x + bb.width);
                miny = Math.min(miny, bb.y);
                maxy = Math.max(maxy, bb.y + bb.height);
            }
        }
        if (minx > maxx) {
            this.zoomToFit();
            return;
        }
        const area = this.app.circuitArea;
        const pad = 80;
        let scale = Math.min(area.width / (maxx - minx + pad), area.height / (maxy - miny + pad));
        scale = Math.min(CanvasNavigation.MAX_SCALE / 2, Math.max(CanvasNavigation.MIN_SCALE, scale));
        const t = this.app.transform;
        t[0] = t[3] = scale;
        t[4] = area.x + area.width / 2 - (minx + maxx) / 2 * scale;
        t[5] = area.y + area.height / 2 - (miny + maxy) / 2 * scale;
        this.app.repaint();
    }

    // ---- input ----

    private canvasPoint(e: MouseEvent): [number, number] {
        const r = this.canvas.getBoundingClientRect();
        return [e.clientX - r.left, e.clientY - r.top];
    }

    private onWheel(e: WheelEvent): void {
        if (this.app.modalDialogIsShowing())
            return;
        const [cx, cy] = this.canvasPoint(e);
        // over the scopes at the bottom: leave it to the scope's own wheel handling
        if (!this.app.circuitArea.contains(cx, cy))
            return;

        let dx = e.deltaX, dy = e.deltaY;
        if (e.deltaMode === 1) { dx *= 16; dy *= 16; }                  // lines
        else if (e.deltaMode === 2) { dx *= this.canvas.clientWidth; dy *= this.canvas.clientHeight; } // pages

        if (e.ctrlKey || e.metaKey) {
            // trackpad pinch arrives as ctrl+wheel with small deltas; a mouse wheel
            // with Ctrl held sends large ones, so scale the two differently
            const k = Math.abs(dy) < 50 ? 0.01 : 0.0025;
            this.zoomAt(Math.exp(-dy * k), cx, cy);
            this.consume(e);
            return;
        }

        // scrolling over a resistor/capacitor/inductor edits its value (upstream
        // behaviour), unless we're in the middle of a pan
        const now = Date.now();
        const midPan = now - this.lastWheelPan < 300;
        if (!midPan && !e.shiftKey && this.wheelEditsHoveredElement())
            return;

        if (e.shiftKey && dx === 0) { dx = dy; dy = 0; }
        this.panBy(-dx, -dy);
        this.lastWheelPan = now;
        this.consume(e);
    }

    private wheelEditsHoveredElement(): boolean {
        const app = this.app;
        if (app.ui.isReadOnly() || !app.menus.mouseWheelEditCheckItem.getState())
            return false;
        const elm: any = app.mouse.getMouseElm();
        if (elm == null)
            return false;
        return elm.isResistorElm() || elm.isCapacitorElm() || elm.isInductorElm() || !!elm.onMouseWheel;
    }

    private onMouseDown(e: MouseEvent): void {
        const middle = e.button === 1;
        if (!(middle || (e.button === 0 && this.spaceHeld)))
            return;
        if (this.app.modalDialogIsShowing())
            return;
        const [cx, cy] = this.canvasPoint(e);
        if (!this.app.circuitArea.contains(cx, cy))
            return;   // middle-drag on a scope adjusts its plot (upstream)
        this.panning = true;
        this.panLastX = e.clientX;
        this.panLastY = e.clientY;
        this.updateCursor();
        this.consume(e);
    }

    private onMouseMove(e: MouseEvent): void {
        if (!this.panning)
            return;
        this.panBy(e.clientX - this.panLastX, e.clientY - this.panLastY);
        this.panLastX = e.clientX;
        this.panLastY = e.clientY;
        e.preventDefault();
    }

    private endPan(): void {
        if (!this.panning)
            return;
        this.panning = false;
        this.updateCursor();
    }

    private typingInField(e: KeyboardEvent): boolean {
        const t = e.target as HTMLElement | null;
        if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)))
            return true;
        return this.app.dialogIsShowing();
    }

    private onKeyDown(e: KeyboardEvent): void {
        if (this.typingInField(e))
            return;
        if (e.code === "Space") {
            if (this.app.shortcuts.get(32) != null)
                return;   // the user assigned their own shortcut to Space
            if (!this.spaceHeld) {
                this.spaceHeld = true;
                this.updateCursor();
            }
            e.preventDefault();   // no page scroll
            return;
        }
        const mod = e.ctrlKey || e.metaKey;
        if (e.shiftKey && !mod && !e.altKey && e.code === "Digit1") {
            this.zoomToFit();
            this.consume(e);
        } else if (e.shiftKey && !mod && !e.altKey && e.code === "Digit2") {
            this.zoomToSelection();
            this.consume(e);
        } else if (mod && !e.altKey && (e.code === "Digit0" || e.code === "Numpad0")) {
            this.zoomTo(1);
            this.consume(e);   // also stops the browser's own page zoom
        } else if (mod && !e.altKey && (e.code === "Equal" || e.code === "NumpadAdd")) {
            this.zoomStep(1);
            this.consume(e);
        } else if (mod && !e.altKey && (e.code === "Minus" || e.code === "NumpadSubtract")) {
            this.zoomStep(-1);
            this.consume(e);
        }
    }

    private onKeyUp(e: KeyboardEvent): void {
        if (e.code === "Space" && this.spaceHeld) {
            this.spaceHeld = false;
            this.updateCursor();
        }
    }

    // Space is the pan key now; keep upstream's keypress handler from treating it as
    // "switch to Select mode" (unless the user assigned Space to something themselves).
    private onKeyPress(e: KeyboardEvent): void {
        if (e.charCode === 32 && !this.typingInField(e) && this.app.shortcuts.get(32) == null)
            this.consume(e);
    }

    private consume(e: Event): void {
        e.preventDefault();
        e.stopImmediatePropagation();
    }

    private updateCursor(): void {
        document.body.classList.toggle("lvPanReady", this.spaceHeld && !this.panning);
        document.body.classList.toggle("lvPanning", this.panning);
    }

    // ---- zoom pill ----

    // Called once the canvas wrapper exists (UIManager.init).
    mountZoomPill(container: HTMLElement): void {
        const pill = document.createElement("div");
        pill.className = "zoomPill";

        const minus = this.pillButton("zoomPillStep", "−", Locale.LS("Zoom out"), () => this.zoomStep(-1));
        const label = this.pillButton("zoomPillLabel", "100%", Locale.LS("Zoom options"), () => this.toggleMenu());
        label.setAttribute("aria-haspopup", "menu");
        const plus = this.pillButton("zoomPillStep", "+", Locale.LS("Zoom in"), () => this.zoomStep(1));
        pill.append(minus, label, plus);

        const menu = document.createElement("div");
        menu.className = "zoomPillMenu";
        menu.setAttribute("role", "menu");
        const item = (text: string, hint: string, run: () => void) => {
            const b = document.createElement("button");
            b.type = "button";
            b.setAttribute("role", "menuitem");
            b.innerHTML = `<span>${text}</span><span class="zoomPillHint">${hint}</span>`;
            b.addEventListener("click", () => { this.closeMenu(); run(); });
            menu.appendChild(b);
        };
        const mod = /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl+";
        item(Locale.LS("Zoom in"), mod + "+", () => this.zoomStep(1));
        item(Locale.LS("Zoom out"), mod + "−", () => this.zoomStep(-1));
        item(Locale.LS("Zoom to fit"), "Shift+1", () => this.zoomToFit());
        item(Locale.LS("Zoom to selection"), "Shift+2", () => this.zoomToSelection());
        const sep = document.createElement("div");
        sep.className = "zoomPillSep";
        menu.appendChild(sep);
        item("50%", "", () => this.zoomTo(0.5));
        item("100%", mod + "0", () => this.zoomTo(1));
        item("200%", "", () => this.zoomTo(2));
        pill.appendChild(menu);

        document.addEventListener("mousedown", (e) => {
            if (this.pillMenu?.classList.contains("open") && !pill.contains(e.target as Node))
                this.closeMenu();
        });
        menu.addEventListener("keydown", (e) => { if (e.key === "Escape") { this.closeMenu(); label.focus(); } });

        container.appendChild(pill);
        this.pill = pill;
        this.pillLabel = label;
        this.pillMenu = menu;
        this.afterPaint();
    }

    private pillButton(cls: string, text: string, title: string, run: () => void): HTMLButtonElement {
        const b = document.createElement("button");
        b.type = "button";
        b.className = cls;
        b.textContent = text;
        b.title = title;
        b.setAttribute("aria-label", title);
        b.tabIndex = 0;
        b.addEventListener("click", run);
        return b;
    }

    private toggleMenu(): void {
        if (this.pillMenu?.classList.contains("open"))
            this.closeMenu();
        else {
            this.pillMenu?.classList.add("open");
            this.pillLabel?.setAttribute("aria-expanded", "true");
        }
    }

    private closeMenu(): void {
        this.pillMenu?.classList.remove("open");
        this.pillLabel?.setAttribute("aria-expanded", "false");
    }

    // Called at the end of every frame (UIManager.updateCircuit); cheap when nothing changed.
    afterPaint(): void {
        if (this.pillLabel == null)
            return;
        const s = this.scale;
        if (s === this.shownScale)
            return;
        this.shownScale = s;
        this.pillLabel.textContent = Math.round(s * 100) + "%";
    }
}
