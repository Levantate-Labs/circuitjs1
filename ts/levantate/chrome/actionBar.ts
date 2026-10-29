/*
    Copyright (C) 2026 Levantate Labs

    This file is part of the Levantate Labs fork of CircuitJS1, distributed under
    the GNU General Public License, version 2 or (at your option) any later
    version. See COPYING.txt.
*/

// The action bar under the app bar: edit tools on the left (history,
// clipboard, arrange), a hint about the selection or the tool in the middle,
// and the run controls on the right (Run / Reset / Freeze / Speed, placed by
// UIManager). Parts live in the tool dock and the Parts menu, zoom in the
// zoom pill, so neither is repeated here.

import { ICONS } from "./icons";

export interface ActionBarHost {
    run(menu: string, item: string): void;
}

interface Tool { icon: string; label: string; menu: string; item: string; }

const GROUPS: Tool[][] = [
    [
        { icon: ICONS.undo, label: "Undo (Ctrl+Z)", menu: "edit", item: "undo" },
        { icon: ICONS.redo, label: "Redo (Ctrl+Y)", menu: "edit", item: "redo" },
    ],
    [
        { icon: ICONS.cut, label: "Cut (Ctrl+X)", menu: "edit", item: "cut" },
        { icon: ICONS.copy, label: "Copy (Ctrl+C)", menu: "edit", item: "copy" },
        { icon: ICONS.paste, label: "Paste (Ctrl+V)", menu: "edit", item: "paste" },
        { icon: ICONS.duplicate, label: "Duplicate (Ctrl+D)", menu: "edit", item: "duplicate" },
    ],
    [
        { icon: ICONS.rotateLeft, label: "Rotate left", menu: "edit", item: "rotateCCW" },
        { icon: ICONS.rotateRight, label: "Rotate right", menu: "edit", item: "rotateCW" },
        { icon: ICONS.flipH, label: "Flip horizontally", menu: "edit", item: "mirrorX" },
        { icon: ICONS.flipV, label: "Flip vertically", menu: "edit", item: "mirrorY" },
        { icon: ICONS.trash, label: "Delete (Delete)", menu: "edit", item: "delete" },
    ],
];

/** Fills `bar` (the toolbar element) and returns its hint and run-controls slots. */
export function buildActionBar(bar: HTMLElement, host: ActionBarHost): { hint: HTMLElement; runSlot: HTMLElement } {
    bar.classList.add("actionBar");
    GROUPS.forEach((group, i) => {
        if (i > 0) {
            const sep = document.createElement("span");
            sep.className = "toolbarSep";
            bar.appendChild(sep);
        }
        for (const t of group) {
            const b = document.createElement("span");
            b.className = "toolbarButton actionButton";
            b.setAttribute("role", "button");
            b.setAttribute("aria-label", t.label);
            b.title = t.label;
            b.dataset.action = t.item;
            b.innerHTML = t.icon;
            b.addEventListener("click", () => host.run(t.menu, t.item));
            bar.appendChild(b);
        }
    });

    const hint = document.createElement("span");
    hint.className = "toolbarMode actionHint";
    bar.appendChild(hint);

    const runSlot = document.createElement("div");
    runSlot.className = "actionRunSlot";
    bar.appendChild(runSlot);
    return { hint, runSlot };
}

/** The hint text: what the current tool does, or what is selected. */
export function hintText(s: {
    dragging: boolean;
    placing: string | null;      // part label while a part tool is on
    selected: string[];          // labels of the selected parts
    readOnly: boolean;
}): string {
    if (s.readOnly)
        return "View only";
    if (s.dragging)
        return "Release to place it";
    if (s.placing)
        return "Placing " + s.placing + " · drag on the canvas · Esc to stop";
    if (s.selected.length === 1)
        return s.selected[0] + " selected";
    if (s.selected.length > 1)
        return s.selected.length + " parts selected";
    return "";
}
