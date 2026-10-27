/*
    Copyright (C) 2026 Levantate Labs

    This file is part of the Levantate Labs fork of CircuitJS1, distributed under
    the GNU General Public License, version 2 or (at your option) any later
    version. See COPYING.txt.
*/

// Floating tool dock (roadmap slice L8a): the tools students use most, at the
// bottom centre of the canvas like a design tool. Click a part to pick it, or
// press and drag it onto the canvas. "More parts" opens the searchable palette.
// Part buttons carry data-elm-class, so an exam's allow-list hides them like
// the toolbar's; data-exam-hidden buttons (grading points) are hidden in exams.

import { Locale } from "../../Locale";

interface DockHost {
    enabled(): boolean;
    historyButtons(): boolean;                // undo/redo here (when the toolbar row is hidden)
    instrumentsAllowed(): boolean;            // the host may turn instruments off
    instruments(): { label: string; open(): boolean; toggle(): void }[];
    canvasHeight(): number;
    circuitAreaHeight(): number;
    mouseMode(): number;
    modeSelect: number;
    modeDragAll: number;
    modeAddElm: number;
    partMode(): string;                       // class name being added, if any
    labelFor(cls: string): string;
    shortcutFor(cls: string): string | null;
    partIcon(cls: string): string | null;     // toolbar SVG markup, if the toolbar has one
    run(menu: string, item: string): void;
    beginDrag(cls: string, clientX: number, clientY: number): void;
}

// stroke icons in the toolbar's style (24px box, currentColor)
const ICONS = {
    select: "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.8' stroke-linejoin='round'><path d='M5 3l14 8-6 2-3 6z'/></svg>",
    hand: "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.7' stroke-linecap='round' stroke-linejoin='round'><path d='M8 13V5.5a1.5 1.5 0 013 0V12m0-6.5V4a1.5 1.5 0 013 0v8m0-6a1.5 1.5 0 013 0v7m0-4a1.5 1.5 0 013 0V15a6 6 0 01-6 6h-1.5a6 6 0 01-4.6-2.2L4 15.6a1.5 1.5 0 012.3-1.9L8 15.5'/></svg>",
    undo: "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'><path d='M9 14L4 9l5-5'/><path d='M4 9h10.5a5.5 5.5 0 010 11H11'/></svg>",
    redo: "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'><path d='M15 14l5-5-5-5'/><path d='M20 9H9.5a5.5 5.5 0 000 11H13'/></svg>",
    meter: "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'><rect x='5' y='2.5' width='14' height='19' rx='2.5'/><rect x='8' y='5.5' width='8' height='4' rx='1'/><circle cx='12' cy='15' r='3'/><path d='M12 15l1.6-1.6'/></svg>",
    more: "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.8' stroke-linecap='round'><circle cx='10.5' cy='10.5' r='5.5'/><path d='M15 15l5 5'/><path d='M10.5 8v5M8 10.5h5'/></svg>",
    pin: "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'><path d='M12 21s-6.5-5.6-6.5-10.5a6.5 6.5 0 0113 0C18.5 15.4 12 21 12 21z'/><circle cx='12' cy='10.5' r='2.2'/></svg>",
};

const PARTS = [
    "WireElm", "ResistorElm", "CapacitorElm", "InductorElm", "DiodeElm",
    "DCVoltageElm", "GroundElm", "SwitchElm", "OpAmpElm",
];

export class ToolDock {
    private readonly el: HTMLElement;
    private readonly buttons: { el: HTMLElement; active: () => boolean }[] = [];
    private readonly history: HTMLElement[] = [];
    private readonly meterButton: HTMLElement;

    constructor(private readonly host: DockHost, container: HTMLElement) {
        this.el = document.createElement("div");
        this.el.className = "toolDock";
        this.el.setAttribute("role", "toolbar");
        this.el.setAttribute("aria-label", Locale.LS("Tools"));

        // undo / redo, shown only when the toolbar row (which has them) is hidden
        const mod = /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl+";
        this.history.push(
            this.addButton(ICONS.undo, Locale.LS("Undo"), mod + "Z", () => host.run("edit", "undo"), () => false),
            this.addButton(ICONS.redo, Locale.LS("Redo"), mod + "Y", () => host.run("edit", "redo"), () => false),
            this.addSeparator());
        this.addButton(ICONS.select, Locale.LS("Select"), "Esc",
            () => host.run("main", "Select"), () => host.mouseMode() === host.modeSelect);
        this.addButton(ICONS.hand, Locale.LS("Hand: drag to pan"), "Space",
            () => host.run("main", "DragAll"), () => host.mouseMode() === host.modeDragAll);
        this.addSeparator();

        for (const cls of PARTS) {
            const icon = host.partIcon(cls);
            if (icon == null)
                continue;
            const b = this.addButton(icon, host.labelFor(cls), host.shortcutFor(cls),
                () => host.run("main", cls),
                () => host.mouseMode() === host.modeAddElm && host.partMode() === cls);
            b.dataset.elmClass = cls;
            // press and drag drops the part where the mouse is released
            b.addEventListener("mousedown", (e) => {
                if (e.button === 0)
                    host.beginDrag(cls, e.clientX, e.clientY);
            });
        }
        this.addSeparator();

        this.addButton(ICONS.more, Locale.LS("More parts: search all parts"), "/",
            () => host.run("edit", "search"), () => false);
        this.meterButton = this.addButton(ICONS.meter, Locale.LS("Instruments"), null,
            () => this.toggleMenu(), () => this.menuOpen() || host.instruments().some((i) => i.open()));
        this.meterButton.setAttribute("aria-haspopup", "menu");
        const pin = this.addButton(ICONS.pin, host.labelFor("GradePointElm"), null,
            () => host.run("main", "GradePointElm"),
            () => host.mouseMode() === host.modeAddElm && host.partMode() === "GradePointElm");
        pin.dataset.elmClass = "GradePointElm";
        pin.dataset.examHidden = "true";   // students don't add grading points

        container.appendChild(this.el);
        this.update();
    }

    private addButton(icon: string, label: string, shortcut: string | null,
                      onClick: () => void, active: () => boolean): HTMLElement {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "toolDockButton";
        b.innerHTML = icon;
        const tip = shortcut ? label + " (" + shortcut + ")" : label;
        b.title = tip;
        b.setAttribute("aria-label", tip);
        b.addEventListener("click", onClick);
        this.el.appendChild(b);
        this.buttons.push({ el: b, active });
        return b;
    }

    // ---- instruments menu ----

    private menu: HTMLElement | null = null;

    private menuOpen(): boolean { return this.menu != null; }

    private toggleMenu(): void {
        if (this.menu != null) {
            this.closeMenu();
            return;
        }
        const m = document.createElement("div");
        m.className = "toolDockMenu";
        m.setAttribute("role", "menu");
        for (const inst of this.host.instruments()) {
            const b = document.createElement("button");
            b.type = "button";
            b.setAttribute("role", "menuitemcheckbox");
            b.setAttribute("aria-checked", String(inst.open()));
            b.innerHTML = `<span class="toolDockMenuCheck">${inst.open() ? "✓" : ""}</span>${inst.label}`;
            b.addEventListener("click", () => {
                inst.toggle();
                this.closeMenu();
            });
            m.appendChild(b);
        }
        this.el.parentElement!.appendChild(m);
        const r = this.meterButton.getBoundingClientRect(), p = this.el.parentElement!.getBoundingClientRect();
        m.style.left = Math.max(8, r.left - p.left + r.width / 2 - 90) + "px";
        m.style.bottom = (p.bottom - r.top + 8) + "px";
        this.menu = m;
        setTimeout(() => document.addEventListener("pointerdown", this.outside, true));
    }

    private readonly outside = (e: Event) => {
        if (this.menu && !this.menu.contains(e.target as Node) && !this.meterButton.contains(e.target as Node))
            this.closeMenu();
    };

    private closeMenu(): void {
        this.menu?.remove();
        this.menu = null;
        document.removeEventListener("pointerdown", this.outside, true);
    }

    private addSeparator(): HTMLElement {
        const s = document.createElement("span");
        s.className = "toolDockSep";
        this.el.appendChild(s);
        return s;
    }

    // Called once per frame: position above the scopes and mark the active tool.
    update(): void {
        const on = this.host.enabled();
        this.el.classList.toggle("lvHidden", !on);
        document.body.classList.toggle("lvDock", on);
        if (!on)
            return;
        this.el.style.bottom = (this.host.canvasHeight() - this.host.circuitAreaHeight() + 14) + "px";
        this.meterButton.classList.toggle("lvHidden", !this.host.instrumentsAllowed());
        if (this.menu != null && !this.host.instrumentsAllowed())
            this.closeMenu();
        const history = this.host.historyButtons();
        for (const h of this.history)
            h.classList.toggle("lvHidden", !history);
        for (const b of this.buttons) {
            const a = b.active();
            b.el.classList.toggle("active", a);
            b.el.setAttribute("aria-pressed", String(a));
        }
    }
}
