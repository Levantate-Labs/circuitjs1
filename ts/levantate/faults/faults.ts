/*
    Copyright (C) 2026 Levantate Labs

    This file is part of the Levantate Labs fork of CircuitJS1, distributed under
    the GNU General Public License, version 2 or (at your option) any later
    version. See COPYING.txt.
*/

// Sealed parts and faults (roadmap slice L11): fault-finding questions.
//
// A sealed part shows a marking an author chose ("1 kΩ") instead of its value,
// and in a student's lab it can't be selected, edited, moved or deleted. It
// can carry a fault: open, short, or reversed (polar parts). A "wrong value"
// fault needs no flag: the part's real value just differs from its marking.
//
// A fault replaces the part's own methods on that one object (stamp, doStep,
// calculateCurrent and so on), so the simulator, the grader and the SPICE
// export all see the faulty part while it is drawn as the healthy one.
//
// The circuit data reaching the browser still says which parts are faulty; a
// student with the browser's developer tools could read it. Marks never depend
// on that: the grading server checks the answers.

import { Exam } from "../exam/exam";

export type Fault = "" | "open" | "short" | "reversed";
export const FAULTS: Fault[] = ["", "open", "short", "reversed"];

export interface SealInfo {
    shown: string;    // the marking drawn instead of the value; "" draws none
    fault: Fault;
}

export const FAULT_LABEL: Record<Fault, string> = {
    "": "None",
    open: "Open circuit",
    short: "Short circuit",
    reversed: "Fitted backwards",
};

// what a faulty part looks like to the simulator
export const OPEN_OHMS = 1e9;
export const SHORT_OHMS = 1e-3;

// Parts whose direction matters, so "reversed" is a fault.
const POLAR = new Set(["DiodeElm", "LEDElm", "ZenerElm", "VaractorElm", "PolarCapacitorElm"]);

export const Seal = {
    // the host page opened this lab for an author (the question editor):
    // sealed parts stay editable and show their real values
    author: false,

    // sealed parts are locked and hide their values in a student's lab
    enforced(): boolean {
        return Exam.embedded && !this.author;
    },
};

// Parts that can be sealed and made faulty: two terminals, no voltage source
// of their own (resistors, capacitors, inductors, diodes, LEDs, lamps, ...).
export function faultable(ce: any): boolean {
    if (ce == null || ce.isWireElm?.() || ce.levInstrument)
        return false;
    const cls = ce.constructor?.name ?? "";
    if (cls === "GradePointElm" || cls === "GroundElm" || cls.endsWith("RailElm"))
        return false;
    try {
        return ce.getPostCount() === 2 && ce.getVoltageSourceCount() === 0;
    } catch {
        return false;
    }
}

export function canReverse(ce: any): boolean {
    return faultable(ce) && POLAR.has(ce.constructor?.name ?? "");
}

export function sealOf(ce: any): SealInfo | null {
    return ce?.levSeal ?? null;
}

// The methods a seal or fault replaces on the part.
const PATCHED = ["stamp", "doStep", "startIteration", "stepFinished", "nonLinear", "calculateCurrent",
    "getConnection", "hasGroundConnection", "getInternalNodeCount", "getInfo", "drawValues"] as const;

// Seal a part (info) or unseal it (null). Safe to call again with new info.
export function setSeal(ce: any, info: SealInfo | null): void {
    for (const m of PATCHED)
        delete ce[m];   // back to the class's own methods
    if (info == null || !faultable(ce)) {
        delete ce.levSeal;
        if (Seal.enforced())
            ce.levLocked = false;
        return;
    }
    const fault: Fault = info.fault === "reversed" && !canReverse(ce) ? "" : info.fault;
    ce.levSeal = { shown: info.shown.slice(0, 40), fault };
    if (Seal.enforced()) {
        ce.levLocked = true;
        ce.setSelected?.(false);
    }
    patchDisplay(ce);
    if (fault === "open" || fault === "short")
        patchAsResistor(ce, fault === "open" ? OPEN_OHMS : SHORT_OHMS);
    else if (fault === "reversed")
        patchReversed(ce);
}

// The marking replaces the value; a student's lab hides the part's details.
function patchDisplay(ce: any): void {
    const proto = Object.getPrototypeOf(ce);
    ce.drawValues = function (g: any, s: string, hs: number) {
        const shown = this.levSeal?.shown ?? "";
        if (s != null && shown !== "")
            proto.drawValues.call(this, g, shown, hs);
    };
    // callers pass a fixed-size array and stop at its first empty entry
    ce.getInfo = function (arr: string[]) {
        proto.getInfo.call(this, arr);
        if (!Seal.enforced()) {
            const f: Fault = this.levSeal?.fault ?? "";
            const i = arr.findIndex((x) => x == null || x === "");
            const line = f ? "fault: " + FAULT_LABEL[f] : "sealed, no fault";
            if (i >= 0)
                arr[i] = line;
            return;
        }
        arr[1] = "marked " + (this.levSeal?.shown || "(no marking)");
        arr[2] = "sealed: measure it to test it";
        for (let i = 3; i < arr.length; i++)
            arr[i] = null as any;
    };
}

// Open and short: the part becomes a resistor between its two posts.
function patchAsResistor(ce: any, ohms: number): void {
    ce.getInternalNodeCount = () => 0;
    ce.nonLinear = () => false;
    ce.getConnection = () => true;
    ce.hasGroundConnection = () => false;
    ce.startIteration = () => {};
    ce.stepFinished = () => {};
    ce.doStep = () => {};
    ce.stamp = function () {
        // CircuitElm.sim (a static, read through the class so this module
        // needn't import the simulator)
        this.constructor.sim.stampResistor(this.nodes[0], this.nodes[1], ohms);
    };
    ce.calculateCurrent = function () {
        this.current = (this.nodes[0].v - this.nodes[1].v) / ohms;
    };
}

// Reversed: the part's own model with its two posts swapped.
function patchReversed(ce: any): void {
    const proto = Object.getPrototypeOf(ce);
    const swapped = (name: string) => function (this: any, ...args: any[]) {
        const n = this.nodes;
        [n[0], n[1]] = [n[1], n[0]];
        try {
            return proto[name].apply(this, args);
        } finally {
            [n[0], n[1]] = [n[1], n[0]];
        }
    };
    ce.stamp = swapped("stamp");
    ce.doStep = swapped("doStep");
    ce.startIteration = swapped("startIteration");
    ce.stepFinished = swapped("stepFinished");
    const calc = swapped("calculateCurrent");
    ce.calculateCurrent = function () {
        calc.call(this);
        this.current = -this.current;   // drawn the other way round
    };
}

// The resistance a meter reads across a part (multimeter ohms mode).
export function effectiveResistance(ce: any): number | undefined {
    const f = sealOf(ce)?.fault;
    if (f === "open")
        return OPEN_OHMS;   // over the meter's range: it reads OL
    if (f === "short")
        return SHORT_OHMS;
    return ce?.resistance;
}

// ---- saving and loading (attributes on the part's XML element) ----

export function writeSealAttrs(elem: Element, ce: any): void {
    const s = sealOf(ce);
    if (s == null)
        return;
    elem.setAttribute("lvSeal", s.shown);
    if (s.fault)
        elem.setAttribute("lvFault", s.fault);
}

export function readSealAttrs(elem: Element, ce: any): void {
    const shown = elem.getAttribute("lvSeal");
    if (shown == null)
        return;
    const f = elem.getAttribute("lvFault") ?? "";
    setSeal(ce, { shown, fault: (FAULTS as string[]).includes(f) ? f as Fault : "" });
}

// Re-apply seals after the lab's mode changes (Seal.author, Exam.embedded).
export function refreshSeals(elms: any[]): void {
    for (const ce of elms) {
        const s = sealOf(ce);
        if (s != null)
            setSeal(ce, s);
    }
}
