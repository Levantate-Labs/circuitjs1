/*
    Copyright (C) 2026 Levantate Labs

    This file is part of the Levantate Labs fork of CircuitJS1, distributed under
    the GNU General Public License, version 2 or (at your option) any later
    version. See COPYING.txt.
*/

// The "Fault finding" section of a part's properties panel, for authors: seal
// the part, give it a marking, and pick a fault. Not shown in a student's lab.

import { FAULT_LABEL, FAULTS, Seal, canReverse, faultable, sealOf, setSeal, type Fault } from "./faults";

// A starting marking: the value the part shows now ("1kΩ").
function currentValueText(ce: any): string {
    const arr: string[] = new Array(12).fill("");
    try {
        ce.getInfo(arr);
    } catch {
        return "";
    }
    for (const line of arr.slice(1)) {
        const m = /^\s*[A-Za-z]{1,3}\s*=\s*(.+)$/.exec(line ?? "");
        if (m && !/^(I|Vd|P|V)$/.test(line.split("=")[0].trim()))
            return m[1].trim();
    }
    return "";
}

export function buildSealSection(ce: any, onChange: () => void): HTMLElement | null {
    if (!faultable(ce) || Seal.enforced())
        return null;

    const sec = document.createElement("section");
    sec.className = "propsSeal";
    const h = document.createElement("div");
    h.className = "propsSealTitle";
    h.textContent = "Fault finding";
    sec.appendChild(h);

    const sealRow = document.createElement("label");
    sealRow.className = "propsSealRow";
    const sealBox = document.createElement("input");
    sealBox.type = "checkbox";
    sealRow.append(sealBox, "Sealed: students see the marking, not the value, and can't edit it");
    sec.appendChild(sealRow);

    const markRow = document.createElement("label");
    markRow.className = "propsSealField";
    markRow.append("Marking");
    const mark = document.createElement("input");
    mark.type = "text";
    mark.maxLength = 40;
    mark.placeholder = "e.g. R2 1kΩ";
    markRow.appendChild(mark);
    sec.appendChild(markRow);

    const faultRow = document.createElement("label");
    faultRow.className = "propsSealField";
    faultRow.append("Fault");
    const fault = document.createElement("select");
    for (const f of FAULTS) {
        if (f === "reversed" && !canReverse(ce))
            continue;
        const o = document.createElement("option");
        o.value = f;
        o.textContent = FAULT_LABEL[f];
        fault.appendChild(o);
    }
    faultRow.appendChild(fault);
    sec.appendChild(faultRow);

    const note = document.createElement("p");
    note.className = "propsSealNote";
    note.textContent = "For a wrong value, keep the marking and change the value above.";
    sec.appendChild(note);

    const sync = () => {
        const s = sealOf(ce);
        sealBox.checked = s != null;
        mark.value = s?.shown ?? "";
        fault.value = s?.fault ?? "";
        markRow.classList.toggle("lvHidden", s == null);
        faultRow.classList.toggle("lvHidden", s == null);
        note.classList.toggle("lvHidden", s == null);
    };
    const apply = (info: { shown: string; fault: Fault } | null) => {
        setSeal(ce, info);
        sync();
        onChange();
    };
    sealBox.addEventListener("change", () =>
        apply(sealBox.checked ? { shown: currentValueText(ce), fault: "" } : null));
    mark.addEventListener("input", () => apply({ shown: mark.value, fault: fault.value as Fault }));
    fault.addEventListener("change", () => apply({ shown: mark.value, fault: fault.value as Fault }));
    // keys typed here stay here (they'd pick tools otherwise)
    sec.addEventListener("keydown", (e) => e.stopPropagation());
    sync();
    return sec;
}
