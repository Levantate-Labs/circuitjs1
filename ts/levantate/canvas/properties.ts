/*
    Copyright (C) 2026 Levantate Labs

    This file is part of the Levantate Labs fork of CircuitJS1, distributed under
    the GNU General Public License, version 2 or (at your option) any later
    version. See COPYING.txt.
*/

// Properties panel (roadmap slice L8b): the editor for a part, shown as a
// panel floating over the right of the canvas instead of a dialog. Edits apply
// as soon as a field changes (one undo step per panel), and a "Live" section
// under the fields shows the part's current, voltage, power and so on as the
// simulation runs. EditDialog builds the fields; this adds the frame, and for
// authors the Fault finding section (levantate/faults/sealPanel.ts).

import { buildSealSection } from "../faults/sealPanel";

export interface InfoSource {
    getInfo(arr: string[]): void;
}

export type InfoRow = { label: string; value: string } | { note: string };

// "I = 2.5 mA" -> label/value; anything else is shown as a plain note
export function parseInfoLine(line: string): InfoRow {
    const m = /^\s*([^=]{1,24}?)\s*=\s*(.+)$/.exec(line);
    return m ? { label: m[1], value: m[2].trim() } : { note: line.trim() };
}

// getInfo's lines after the first (the part's name, already the title)
export function infoRows(src: InfoSource): InfoRow[] {
    const arr: string[] = new Array(12).fill("");
    try {
        src.getInfo(arr);
    } catch {
        return [];
    }
    return arr.slice(1).filter((s) => s != null && s.trim() !== "").map(parseInfoLine);
}

const CLOSE = "<svg viewBox='0 0 24 24' width='16' height='16' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round'><path d='M6 6l12 12M18 6L6 18'/></svg>";

export class PropsPanel {
    private readonly live: HTMLElement;
    private readonly liveRows: HTMLElement;
    private lastText = "";
    private lastUpdate = 0;

    constructor(private readonly dialogEl: HTMLElement, title: HTMLElement,
                private readonly src: InfoSource, close: () => void, changed: () => void = () => {}) {
        dialogEl.classList.add("propsPanel");
        // the panel names the part ("Resistor"); "Edit" is implied
        title.textContent = (title.textContent ?? "").replace(/^Edit\s+/, "");
        dialogEl.setAttribute("aria-label", title.textContent ?? "");

        const header = document.createElement("div");
        header.className = "propsHeader";
        title.replaceWith(header);
        header.appendChild(title);
        const x = document.createElement("button");
        x.type = "button";
        x.className = "propsClose";
        x.title = "Close (Esc)";
        x.setAttribute("aria-label", "Close");
        x.innerHTML = CLOSE;
        x.addEventListener("click", close);
        header.appendChild(x);

        const seal = buildSealSection(src, () => { changed(); this.update(true); });
        if (seal != null)
            dialogEl.appendChild(seal);

        this.live = document.createElement("section");
        this.live.className = "propsLive";
        const h = document.createElement("div");
        h.className = "propsLiveTitle";
        h.textContent = "Live";
        this.live.appendChild(h);
        this.liveRows = document.createElement("dl");
        this.live.appendChild(this.liveRows);
        dialogEl.appendChild(this.live);
        this.update(true);
    }

    // Place the panel inside the canvas's top-right corner, under the zoom pill.
    position(canvas: DOMRect, viewportWidth: number, maxHeight: number): void {
        const s = this.dialogEl.style;
        s.position = "fixed";
        s.margin = "0";
        s.left = "auto";
        s.top = (canvas.top + 56) + "px";
        s.right = Math.max(8, viewportWidth - canvas.right + 12) + "px";
        s.maxHeight = Math.max(160, maxHeight - 68) + "px";
    }

    // Called every frame; rewrites the live values at most ~7 times a second.
    update(force = false): void {
        const now = Date.now();
        if (!force && now - this.lastUpdate < 150)
            return;
        this.lastUpdate = now;
        const rows = infoRows(this.src);
        const text = JSON.stringify(rows);
        if (text === this.lastText)
            return;
        this.lastText = text;
        this.live.classList.toggle("lvHidden", rows.length === 0);
        this.liveRows.innerHTML = "";
        for (const r of rows) {
            if ("note" in r) {
                const d = document.createElement("dd");
                d.className = "propsNote";
                d.textContent = r.note;
                this.liveRows.appendChild(d);
                continue;
            }
            const dt = document.createElement("dt");
            dt.textContent = r.label;
            const dd = document.createElement("dd");
            dd.textContent = r.value;
            this.liveRows.appendChild(dt);
            this.liveRows.appendChild(dd);
        }
    }
}
