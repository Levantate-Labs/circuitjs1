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

// identifies a part by type, position and (for grading points) id
export function lockKey(ce: any): string {
    return [ce.constructor?.name, ce.x, ce.y, ce.x2, ce.y2, ce.pointId ?? ""].join("|");
}

function lockOne(ce: any, deleteSliders: (ce: any) => void): void {
    ce.levLocked = true;
    ce.setSelected?.(false);
    deleteSliders(ce);   // a starter part's slider would change its value
}

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
        if (!this.enforcing)
            return true;
        // grading points come only from the question: a student who could add
        // one could give it a checked point's id and choose what it measures
        if (this.active && className === "GradePointElm")
            return false;
        if (this.allowedParts == null)
            return true;
        const base = className.startsWith("SubcircuitElm:") ? "SubcircuitElm" : className;
        return ALWAYS_ALLOWED.has(base) || this.allowedParts.has(base);
    },

    isLocked(elm: unknown): boolean {
        return !!(elm as any)?.levLocked;
    },

    // The locked starter parts, by lockKey(). Undo and redo rebuild the circuit
    // from a saved copy, which doesn't record locks, so they are put back from
    // here. (Locked parts can't move or change, so their keys stay valid.)
    lockedKeys: new Set<string>(),

    lockStarter(elms: any[], deleteSliders: (ce: any) => void): void {
        this.lockedKeys.clear();
        for (const ce of elms) {
            this.lockedKeys.add(lockKey(ce));
            lockOne(ce, deleteSliders);
        }
    },

    relock(elms: any[], deleteSliders: (ce: any) => void): void {
        if (this.lockedKeys.size === 0)
            return;
        for (const ce of elms)
            if (this.lockedKeys.has(lockKey(ce)))
                lockOne(ce, deleteSliders);
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
    topItems: Map<string, HTMLElement>;     // "circuit", "edit", ..., "examples"
    toolbar: HTMLElement;
    mainMenuItems: { _li: HTMLElement | null }[];
    mainMenuItemNames: string[];
    // items that only make sense outside exams (e.g. Options > Disable Editing,
    // which would let a student unlock a submitted circuit)
    examHidden: (HTMLElement | null)[];
}

// Hide what an exam doesn't allow. Safe to call again when the settings change.
export function applyExamUI(refs: ExamUIRefs): void {
    const examOn = Exam.active;
    // inside a host page the Circuit menu goes entirely (the host saves and loads
    // circuits); exams also drop the example circuits
    refs.topItems.get("circuit")?.classList.toggle("lvHidden", examOn || Exam.embedded);
    refs.topItems.get("examples")?.classList.toggle("lvHidden", examOn);
    for (const el of refs.examHidden)
        el?.classList.toggle("lvHidden", examOn);


    // parts not in the allow-list disappear from the Parts menu and the dock
    refs.mainMenuItems.forEach((item, i) => {
        const name = refs.mainMenuItemNames[i];
        item._li?.classList.toggle("lvHidden", !Exam.isPartAllowed(name) && !isModeName(name));
    });
    // toolbar, its variant pickers and the tool dock all tag part buttons
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("[data-elm-class]")))
        el.classList.toggle("lvHidden", !Exam.isPartAllowed(el.dataset.elmClass!));
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("[data-exam-hidden]")))
        el.classList.toggle("lvHidden", examOn);
    // submenus left with nothing visible
    for (const li of Array.from(document.querySelectorAll<HTMLElement>("li.hasSubmenu"))) {
        const visible = li.querySelectorAll(":scope > .menuDropdown > .menuItem:not(.lvHidden)").length;
        li.classList.toggle("lvHidden", visible === 0);
    }

    // (About and licence stays reachable in the Inspector's footer while the
    // Circuit menu is hidden: GPLv2 section 2(c); levantate/chrome/inspector.ts)
}
