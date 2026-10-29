/*
    Copyright (C) 2026 Levantate Labs

    This file is part of the Levantate Labs fork of CircuitJS1, distributed under
    the GNU General Public License, version 2 or (at your option) any later
    version. See COPYING.txt.
*/

// The app bar along the top of the lab: the Maestro mark and product name, the
// circuit's name and save status, the menus, and search / theme / help on the
// right. Menus.ts builds the menus (a table of top-level items, as upstream)
// and hands it here to be placed; in exams the run controls move in too (see
// UIManager.setCompactBar).

import { ICONS, MAESTRO_MARK } from "./icons";

export interface AppBarHost {
    search(): void;
    toggleTheme(): void;
    isDark(): boolean;
}

export class AppBar {
    /** The circuit's name (UIManager.setCircuitTitle writes it). */
    readonly title: HTMLElement;
    /** "Unsaved changes" while there are some. */
    readonly status: HTMLElement;
    /** Where the run controls go when the action bar is hidden (exams). */
    readonly controlsSlot: HTMLElement;
    /** Right-hand buttons; the Help panel adds its button here. */
    readonly right: HTMLElement;
    private readonly themeButton: HTMLButtonElement;
    private lastDark: boolean | null = null;
    private lastStatus = "";

    constructor(private readonly host: AppBarHost, bar: HTMLElement, menus: HTMLElement) {
        bar.classList.add("appBar");

        const brand = document.createElement("div");
        brand.className = "appBarBrand";
        brand.innerHTML = MAESTRO_MARK + "<span class='appBarProduct'>Simulation Lab</span>";

        const name = document.createElement("div");
        name.className = "appBarName";
        this.title = document.createElement("span");
        this.title.className = "appBarTitle";
        this.status = document.createElement("span");
        this.status.className = "appBarStatus";
        name.append(this.title, this.status);

        menus.classList.add("appBarMenus");

        const spacer = document.createElement("div");
        spacer.className = "appBarSpacer";

        this.controlsSlot = document.createElement("div");
        this.controlsSlot.className = "appBarControls";

        this.right = document.createElement("div");
        this.right.className = "appBarRight";
        const search = this.button(ICONS.search, "Search parts and commands (/)", () => host.search());
        this.themeButton = this.button("", "", () => { host.toggleTheme(); this.update(); });
        this.right.append(search, this.themeButton);

        bar.prepend(brand, name);
        bar.insertBefore(menus, null);
        bar.append(spacer, this.controlsSlot, this.right);
        this.update();
    }

    private button(icon: string, label: string, onClick: () => void): HTMLButtonElement {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "appBarButton";
        b.innerHTML = icon;
        b.title = label;
        b.setAttribute("aria-label", label);
        b.addEventListener("click", (e) => { e.stopPropagation(); onClick(); });
        // keep keyboard focus on the canvas so shortcuts keep working
        b.addEventListener("mousedown", (e) => e.preventDefault());
        return b;
    }

    /** Called every frame; touches the DOM only when something changed. */
    update(unsaved = false): void {
        const dark = this.host.isDark();
        if (dark !== this.lastDark) {
            this.lastDark = dark;
            this.themeButton.innerHTML = dark ? ICONS.sun : ICONS.moon;
            const label = dark ? "Switch to the light theme" : "Switch to the dark theme";
            this.themeButton.title = label;
            this.themeButton.setAttribute("aria-label", label);
        }
        const status = unsaved && this.title.textContent ? "Unsaved changes" : "";
        if (status !== this.lastStatus) {
            this.lastStatus = status;
            this.status.textContent = status;
        }
    }
}
