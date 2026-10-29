/*
    Copyright (C) 2026 Levantate Labs

    This file is part of the Levantate Labs fork of CircuitJS1, distributed under
    the GNU General Public License, version 2 or (at your option) any later
    version. See COPYING.txt.
*/

// Settings dialog (View › Settings…): the drawing conventions and editing
// preferences most students never change, which upstream listed in its
// Options menu. Each row toggles the same menu state object (CheckItem) the
// rest of the app reads, so saving and loading work as before.

export interface Toggle {
    getState(): boolean;
    toggle(): void;
}

export interface SettingRow {
    toggle: Toggle;
    label: string;
    help: string;
    hidden?: boolean;      // e.g. Disable editing during an exam
}

export interface SettingsHost {
    rows(): { group: string; items: SettingRow[] }[];
    moreOptions(): void;   // upstream's Other Options dialog (colours, wheel sensitivity, …)
    shortcuts(): void;
    repaint(): void;
}

export function openSettings(host: SettingsHost): HTMLDialogElement {
    const d = document.createElement("dialog");
    d.className = "circuitDialog lvSettings";
    d.setAttribute("aria-labelledby", "lvSettingsTitle");

    const head = document.createElement("div");
    head.className = "propsHeader";
    const h = document.createElement("h3");
    h.id = "lvSettingsTitle";
    h.textContent = "Settings";
    const close = document.createElement("button");
    close.type = "button";
    close.className = "propsClose";
    close.setAttribute("aria-label", "Close settings");
    close.innerHTML = "<svg viewBox='0 0 24 24' width='18' height='18' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round'><path d='M6 6l12 12M18 6L6 18'/></svg>";
    close.addEventListener("click", () => d.close());
    head.append(h, close);
    d.appendChild(head);

    for (const g of host.rows()) {
        const items = g.items.filter((r) => !r.hidden);
        if (items.length === 0)
            continue;
        const fs = document.createElement("fieldset");
        fs.className = "lvSettingsGroup";
        const lg = document.createElement("legend");
        lg.textContent = g.group;
        fs.appendChild(lg);
        for (const r of items) {
            const label = document.createElement("label");
            label.className = "lvSettingsRow";
            const box = document.createElement("input");
            box.type = "checkbox";
            box.checked = r.toggle.getState();
            box.addEventListener("change", () => {
                if (box.checked !== r.toggle.getState())
                    r.toggle.toggle();
                box.checked = r.toggle.getState();
                host.repaint();
            });
            const text = document.createElement("span");
            text.innerHTML = "<b></b><small></small>";
            text.querySelector("b")!.textContent = r.label;
            text.querySelector("small")!.textContent = r.help;
            label.append(box, text);
            fs.appendChild(label);
        }
        d.appendChild(fs);
    }

    const foot = document.createElement("div");
    foot.className = "lvSettingsFoot";
    const more = document.createElement("button");
    more.type = "button";
    more.textContent = "Colours and more…";
    more.addEventListener("click", () => { d.close(); host.moreOptions(); });
    const keys = document.createElement("button");
    keys.type = "button";
    keys.textContent = "Keyboard shortcuts…";
    keys.addEventListener("click", () => { d.close(); host.shortcuts(); });
    const done = document.createElement("button");
    done.type = "button";
    done.className = "lvSettingsDone";
    done.textContent = "Done";
    done.addEventListener("click", () => d.close());
    foot.append(more, keys, done);
    d.appendChild(foot);

    d.addEventListener("close", () => d.remove());
    // keys typed in the dialog stay in the dialog (they'd pick tools otherwise)
    d.addEventListener("keydown", (e) => { if (e.key !== "Escape") e.stopPropagation(); });
    document.body.appendChild(d);
    d.showModal();
    return d;
}
