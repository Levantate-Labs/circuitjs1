/*
    Copyright (C) 2026 Levantate Labs

    This file is part of the Levantate Labs fork of CircuitJS1, distributed under
    the GNU General Public License, version 2 or (at your option) any later
    version. See COPYING.txt.
*/

// Exam mode, part allow-list and part locking (roadmap slice L3). Upstream
// files only call the small checks below; everything else lives here.

// Parts that are always allowed: a circuit can't be built without wires.
const ALWAYS_ALLOWED = new Set(["WireElm", "RoutedWireElm"]);

// Commands blocked in exam mode: anything that moves circuits in or out of the
// test, loads examples, or changes tooling.
const BLOCKED_ITEMS = new Set([
    "importfromlocalfile", "importfromtext", "importfromdropbox", "exportasurl",
    "exportaslocalfile", "exportastext", "exportasimage", "copypng", "exportassvg",
    "print", "recover", "newwindow", "save", "saveas", "createsubcircuit",
    "newblankcircuit", "devtools", "subcircuits", "convertWires", "createTest", "shortcuts",
]);

// File-menu commands blocked whenever the lab is embedded in a host page (even
// outside exams): the host saves and loads circuits itself.
const EMBEDDED_BLOCKED_ITEMS = new Set([
    "importfromlocalfile", "importfromtext", "importfromdropbox", "exportasurl",
    "exportaslocalfile", "exportastext", "exportasimage", "copypng", "exportassvg",
    "print", "recover", "newwindow", "save", "saveas",
]);

export const Exam = {
    // running inside a host page (set by the bridge's init): File menu trimmed
    embedded: false,
    // exam mode is on: menus trimmed, no local storage, blocked commands
    active: false,
    // part allow-list (class names); null = everything allowed
    allowedParts: null as Set<string> | null,
    // false while the host's starter circuit is being loaded, so it may contain any part
    enforcing: false,
    // clipboard kept in memory while in exam mode (upstream keeps it in localStorage,
    // which every tab on the simulator's site shares)
    clipboard: "",
    // host callback for integrity events (set by the bridge)
    onIntegrity: null as ((event: string, detail?: string) => void) | null,

    isPartAllowed(className: string): boolean {
        if (!this.enforcing || this.allowedParts == null)
            return true;
        const base = className.startsWith("SubcircuitElm:") ? "SubcircuitElm" : className;
        return ALWAYS_ALLOWED.has(base) || this.allowedParts.has(base);
    },

    isLocked(elm: unknown): boolean {
        return !!(elm as any)?.levLocked;
    },

    // true when an exam blocks this menu command
    blocks(menu: string, item: string): boolean {
        if (menu === "main" && !this.isPartAllowed(item) && !isModeName(item))
            return true;
        if (item === "about")
            return false;
        if (this.embedded && EMBEDDED_BLOCKED_ITEMS.has(item))
            return true;
        if (!this.active)
            return false;
        if (menu === "circuits" || BLOCKED_ITEMS.has(item))
            return true;
        return false;
    },

    report(event: string, detail?: string): void {
        if (this.active)
            this.onIntegrity?.(event, detail);
    },
};

// mouse modes share the "main" menu with part names
function isModeName(item: string): boolean {
    return item === "Select" || item.startsWith("Drag");
}

// ---- exam UI ----

interface ExamUIRefs {
    topItems: Map<string, HTMLElement>;     // "file", "tools", "circuits", ...
    toolbar: HTMLElement;
    mainMenuItems: { _li: HTMLElement | null }[];
    mainMenuItemNames: string[];
    sidePanel: HTMLElement;
    // items that only make sense outside exams (e.g. Options > Disable Editing,
    // which would let a student unlock a submitted circuit)
    examHidden: (HTMLElement | null)[];
    onAbout: () => void;
}

let aboutLink: HTMLElement | null = null;

// Hide what an exam doesn't allow. Safe to call again when the settings change.
export function applyExamUI(refs: ExamUIRefs): void {
    const examOn = Exam.active;
    // inside a host page the File menu goes entirely (the host saves and loads
    // circuits); exams also drop Tools and the example circuits
    refs.topItems.get("file")?.classList.toggle("lvHidden", examOn || Exam.embedded);
    for (const key of ["tools", "circuits"])
        refs.topItems.get(key)?.classList.toggle("lvHidden", examOn);
    for (const el of refs.examHidden)
        el?.classList.toggle("lvHidden", examOn);


    // parts not in the allow-list disappear from the Draw menu and the toolbar
    refs.mainMenuItems.forEach((item, i) => {
        const name = refs.mainMenuItemNames[i];
        item._li?.classList.toggle("lvHidden", !Exam.isPartAllowed(name) && !isModeName(name));
    });
    for (const el of Array.from(refs.toolbar.querySelectorAll<HTMLElement>("[data-elm-class]")))
        el.classList.toggle("lvHidden", !Exam.isPartAllowed(el.dataset.elmClass!));
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(".palette-container [data-elm-class]")))
        el.classList.toggle("lvHidden", !Exam.isPartAllowed(el.dataset.elmClass!));
    // submenus left with nothing visible
    for (const li of Array.from(document.querySelectorAll<HTMLElement>("li.hasSubmenu"))) {
        const visible = li.querySelectorAll(":scope > .menuDropdown > .menuItem:not(.lvHidden)").length;
        li.classList.toggle("lvHidden", visible === 0);
    }

    // the File menu (with About) is hidden when embedded, so keep an About /
    // licence link in the side panel (GPLv2 section 2(c))
    const needAboutLink = examOn || Exam.embedded;
    if (needAboutLink && aboutLink == null) {
        const b = document.createElement("button");
        b.type = "button";
        aboutLink = b;
        aboutLink.className = "lvAboutLink";
        aboutLink.textContent = "About & licence";
        aboutLink.addEventListener("click", refs.onAbout);
        refs.sidePanel.appendChild(aboutLink);
    }
    aboutLink?.classList.toggle("lvHidden", !needAboutLink);
}
