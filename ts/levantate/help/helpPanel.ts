/*
    Copyright (C) 2026 Levantate Labs

    This file is part of the Levantate Labs fork of CircuitJS1, distributed under
    the GNU General Public License, version 2 or (at your option) any later
    version. See COPYING.txt.
*/

// Help panel: the user guide in a drawer on the right of the window, with
// search, the keyboard shortcuts and a way back into the guided tour. Opened
// from the "?" button at the end of the zoom pill, the ? key or F1.

import { HELP_SECTIONS, SHORTCUTS, matchesQuery, type HelpSection } from "./content";

export interface HelpHost {
    startTour(): void;
}

const ICON_HELP = "<svg viewBox='0 0 24 24' width='18' height='18' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M9.2 9.2a2.9 2.9 0 015.6 1c0 1.9-2.8 2.6-2.8 4.3'/><circle cx='12' cy='18' r='.6' fill='currentColor'/></svg>";
const ICON_CLOSE = "<svg viewBox='0 0 24 24' width='18' height='18' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round'><path d='M6 6l12 12M18 6L6 18'/></svg>";
const ICON_TOUR = "<svg viewBox='0 0 24 24' width='20' height='20' fill='none' stroke='currentColor' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'><circle cx='12' cy='12' r='9'/><path d='M15.5 8.5l-2 5-5 2 2-5z'/></svg>";

function shortcutsHtml(): string {
    return "<table class='helpKeys'>" +
        SHORTCUTS.map(([keys, what]) => `<tr><td>${keys}</td><td>${what}</td></tr>`).join("") +
        "</table>";
}

export class HelpPanel {
    private readonly button: HTMLButtonElement;
    private readonly drawer: HTMLElement;
    private readonly search: HTMLInputElement;
    private readonly list: HTMLElement;
    private readonly empty: HTMLElement;
    private readonly items: { section: HelpSection; el: HTMLDetailsElement }[] = [];
    private returnFocus: HTMLElement | null = null;

    // the button goes at the end of buttonContainer (the zoom pill)
    constructor(private readonly host: HelpHost, buttonContainer: HTMLElement) {
        this.button = document.createElement("button");
        this.button.type = "button";
        this.button.className = "helpButton";
        this.button.innerHTML = ICON_HELP;
        this.button.title = "Help and user guide (?)";
        this.button.setAttribute("aria-label", "Help and user guide");
        this.button.setAttribute("aria-expanded", "false");
        this.button.addEventListener("click", () => this.toggle());
        const sep = document.createElement("span");
        sep.className = "zoomPillSep";
        buttonContainer.append(sep, this.button);

        this.drawer = document.createElement("aside");
        this.drawer.className = "helpDrawer";
        this.drawer.setAttribute("role", "dialog");
        this.drawer.setAttribute("aria-label", "Help");
        this.drawer.hidden = true;
        this.drawer.innerHTML = `
<header class="helpHead">
  <h2>Help</h2>
  <button type="button" class="helpClose" aria-label="Close help" title="Close (Esc)">${ICON_CLOSE}</button>
</header>
<div class="helpSearch"><input type="search" placeholder="Search help, e.g. graph, units, error" aria-label="Search help"></div>
<div class="helpBody">
  <button type="button" class="helpTourCard">
    <span class="helpTourIcon">${ICON_TOUR}</span>
    <span><b>Take the tour</b><span>A 1-minute walk through the basics</span></span>
  </button>
  <div class="helpList"></div>
  <p class="helpEmpty" hidden></p>
</div>`;
        document.body.appendChild(this.drawer);

        this.search = this.drawer.querySelector("input")!;
        this.list = this.drawer.querySelector(".helpList")!;
        this.empty = this.drawer.querySelector(".helpEmpty")!;
        this.drawer.querySelector(".helpClose")!.addEventListener("click", () => this.close());
        this.drawer.querySelector(".helpTourCard")!.addEventListener("click", () => this.tour());

        for (const section of HELP_SECTIONS) {
            const el = document.createElement("details");
            el.className = "helpSection";
            el.dataset.section = section.id;
            el.innerHTML = `<summary><span class="helpTitle">${section.title}</span>` +
                `<span class="helpSummary">${section.summary}</span></summary>` +
                `<div class="helpText">${section.id === "keys" ? shortcutsHtml() : section.body}</div>`;
            this.list.appendChild(el);
            this.items.push({ section, el });
        }

        this.search.addEventListener("input", () => this.filter());
        this.drawer.addEventListener("click", (e) => {
            const a = (e.target as HTMLElement).closest<HTMLElement>("[data-help-action]");
            if (a == null)
                return;
            e.preventDefault();
            if (a.dataset.helpAction === "tour")
                this.tour();
        });
        // keys typed in the drawer stay in the drawer (they'd pick tools otherwise)
        this.drawer.addEventListener("keydown", (e) => {
            if (e.key === "Escape") {
                e.preventDefault();
                this.close();
            }
            e.stopPropagation();
        });
        this.drawer.addEventListener("keypress", (e) => e.stopPropagation());
        this.drawer.addEventListener("keyup", (e) => e.stopPropagation());
        // F1 anywhere; ? unless typing in a field (keydown, so any keyboard layout works)
        document.addEventListener("keydown", (e) => {
            const t = e.target as HTMLElement | null;
            const typing = t != null && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
            if (e.key === "F1" || (e.key === "?" && !typing && !e.ctrlKey && !e.metaKey && !e.altKey)) {
                e.preventDefault();
                this.toggle();
            }
        });
    }

    isOpen(): boolean {
        return !this.drawer.hidden;
    }

    open(sectionId?: string): void {
        if (!this.isOpen()) {
            this.returnFocus = document.activeElement as HTMLElement | null;
            this.drawer.hidden = false;
            this.button.setAttribute("aria-expanded", "true");
            this.button.classList.add("on");
        }
        if (sectionId != null) {
            const item = this.items.find((i) => i.section.id === sectionId);
            if (item) {
                item.el.open = true;
                item.el.scrollIntoView({ block: "start" });
            }
        }
        this.search.focus();
    }

    close(): void {
        if (!this.isOpen())
            return;
        this.drawer.hidden = true;
        this.button.setAttribute("aria-expanded", "false");
        this.button.classList.remove("on");
        this.returnFocus?.focus?.();
        this.returnFocus = null;
    }

    toggle(): void {
        if (this.isOpen()) this.close(); else this.open();
    }

    private tour(): void {
        this.close();
        this.host.startTour();
    }

    private filter(): void {
        const q = this.search.value.trim();
        let shown = 0;
        for (const { section, el } of this.items) {
            const hit = matchesQuery(section, q);
            el.hidden = !hit;
            // open the matches while searching, close them again when the search is cleared
            el.open = hit && q !== "";
            if (hit)
                shown++;
        }
        this.empty.hidden = shown > 0;
        this.empty.textContent = shown > 0 ? "" : `Nothing in the guide matches "${q}".`;
    }
}
