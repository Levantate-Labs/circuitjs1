/*
    Copyright (C) 2026 Levantate Labs

    This file is part of the Levantate Labs fork of CircuitJS1, distributed under
    the GNU General Public License, version 2 or (at your option) any later
    version. See COPYING.txt.
*/

import { afterEach, describe, expect, it } from "vitest";
import { Exam } from "../exam/exam";
import { OPEN_OHMS, SHORT_OHMS, Seal, canReverse, effectiveResistance, faultable, readSealAttrs, sealOf, setSeal, writeSealAttrs } from "./faults";

// Just enough of a part for the seal code (the simulator itself is covered by
// the grading service's end-to-end test).
class FakeElm {
    resistance = 1000;
    current = 0;
    levLocked = false;
    nodes = [{ v: 5 }, { v: 0 }];
    static sim = { stamped: [] as number[], stampResistor(_a: any, _b: any, r: number) { this.stamped.push(r); } };
    getPostCount() { return 2; }
    getVoltageSourceCount() { return 0; }
    isWireElm() { return false; }
    setSelected() {}
    stamp() { FakeElm.sim.stamped.push(-1); }
    doStep() {}
    calculateCurrent() { this.current = (this.nodes[0].v - this.nodes[1].v) / this.resistance; }
    getInfo(arr: string[]) { arr[0] = "resistor"; arr[1] = "I = 5 mA"; arr[2] = "R = 1kΩ"; }
    drawValues() {}
}
class ResistorElm extends FakeElm {}
class DiodeElm extends FakeElm {}
class VoltageElm extends FakeElm { getVoltageSourceCount() { return 1; } }

// the two Element methods the seal code uses
const xmlElem = (): Element => {
    const attrs = new Map<string, string>();
    return {
        getAttribute: (n: string) => attrs.get(n) ?? null,
        setAttribute: (n: string, v: string) => { attrs.set(n, v); },
    } as unknown as Element;
};

afterEach(() => {
    Exam.embedded = false;
    Seal.author = false;
    FakeElm.sim.stamped = [];
});

describe("sealed parts", () => {
    it("are two-terminal parts without a source; only polar ones reverse", () => {
        expect(faultable(new ResistorElm())).toBe(true);
        expect(faultable(new VoltageElm())).toBe(false);
        expect(canReverse(new ResistorElm())).toBe(false);
        expect(canReverse(new DiodeElm())).toBe(true);
    });

    it("lock in a student's lab and show only the marking", () => {
        Exam.embedded = true;
        const r: any = new ResistorElm();
        setSeal(r, { shown: "R2 1kΩ", fault: "" });
        expect(r.levLocked).toBe(true);
        const arr: string[] = new Array(10).fill(null);
        r.getInfo(arr);
        expect(arr.slice(0, 3)).toEqual(["resistor", "marked R2 1kΩ", "sealed: measure it to test it"]);
        expect(arr.some((s) => s?.startsWith("R ="))).toBe(false);
    });

    it("stay editable for an author, whose info names the fault", () => {
        Exam.embedded = true;
        Seal.author = true;
        const r: any = new ResistorElm();
        setSeal(r, { shown: "R2", fault: "open" });
        expect(r.levLocked).toBe(false);
        const arr: string[] = new Array(10).fill(null);
        r.getInfo(arr);
        expect(arr).toContain("R = 1kΩ");
        expect(arr).toContain("fault: Open circuit");
    });

    it("simulate open and short as resistors, and unseal back to the part", () => {
        const r: any = new ResistorElm();
        setSeal(r, { shown: "R1", fault: "short" });
        r.stamp();
        r.calculateCurrent();
        expect(FakeElm.sim.stamped).toEqual([SHORT_OHMS]);
        expect(r.current).toBeCloseTo(5 / SHORT_OHMS);
        expect(effectiveResistance(r)).toBe(SHORT_OHMS);
        setSeal(r, { shown: "R1", fault: "open" });
        expect(effectiveResistance(r)).toBe(OPEN_OHMS);
        setSeal(r, null);
        r.stamp();
        expect(FakeElm.sim.stamped).toEqual([SHORT_OHMS, -1]);
        expect(sealOf(r)).toBeNull();
        expect(effectiveResistance(r)).toBe(1000);
    });

    it("run a reversed part with its posts swapped and its current turned round", () => {
        const d: any = new DiodeElm();
        setSeal(d, { shown: "D1", fault: "reversed" });
        d.calculateCurrent();
        expect(d.current).toBeCloseTo(5 / 1000);   // (0 − 5) / R, drawn the other way
        expect(d.nodes[0].v).toBe(5);              // posts back in place
        const r: any = new ResistorElm();
        setSeal(r, { shown: "R1", fault: "reversed" });
        expect(sealOf(r)?.fault).toBe("");          // a resistor has no direction
    });

    it("save and load as XML attributes", () => {
        const r: any = new ResistorElm();
        setSeal(r, { shown: "R2 1kΩ", fault: "open" });
        const el = xmlElem();
        writeSealAttrs(el, r);
        expect(el.getAttribute("lvSeal")).toBe("R2 1kΩ");
        expect(el.getAttribute("lvFault")).toBe("open");
        const back: any = new ResistorElm();
        readSealAttrs(el, back);
        expect(sealOf(back)).toEqual({ shown: "R2 1kΩ", fault: "open" });
        el.setAttribute("lvFault", "melted");
        readSealAttrs(el, back);
        expect(sealOf(back)?.fault).toBe("");
        const plain: any = new ResistorElm();
        readSealAttrs(xmlElem(), plain);
        expect(sealOf(plain)).toBeNull();
    });
});
