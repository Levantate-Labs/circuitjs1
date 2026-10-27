/*
    Copyright (C) 2026 Levantate Labs

    This file is part of the Levantate Labs fork of CircuitJS1, distributed under
    the GNU General Public License, version 2 or (at your option) any later
    version. See COPYING.txt.
*/

import { describe, expect, it } from "vitest";
import { CycleWindow, closestOnSegment, findContact, formatReading, resistanceBetween, type MeterElm } from "./meterLogic";

describe("CycleWindow", () => {
    // 50 Hz, 10 V peak around a 2 V offset, uneven steps, stopping mid-cycle
    function sineWindow(seconds: number): CycleWindow {
        const w = new CycleWindow();
        let t = 0.0013;
        for (let i = 0; t < seconds; i++) {
            w.add(t, 2 + 10 * Math.sin(2 * Math.PI * 50 * t));
            t += i % 3 === 0 ? 7e-5 : 3e-5;
        }
        return w;
    }

    it("averages over whole cycles, wherever the window stops", () => {
        for (const len of [0.047, 0.0612, 0.1033]) {
            const w = sineWindow(len);
            expect(w.cycles).toBeGreaterThanOrEqual(1);
            const { avg, rms } = w.result();
            expect(avg).toBeCloseTo(2, 2);
            // RMS of the varying part (what an AC meter shows)
            expect(Math.sqrt(rms * rms - avg * avg)).toBeCloseTo(10 / Math.SQRT2, 2);
        }
    });

    it("treats a constant as steady and reads it exactly", () => {
        const w = new CycleWindow();
        for (let t = 0; t < 0.01; t += 1e-4) w.add(t, 4.998);
        expect(w.steady).toBe(true);
        expect(w.result().avg).toBeCloseTo(4.998, 9);
    });

    it("notices a step that has settled", () => {
        const w = new CycleWindow();
        for (let t = 0; t < 0.01; t += 1e-4) w.add(t, t < 0.002 ? 5 : 2);
        expect(w.steady).toBe(false);
        expect(w.settled).toBe(true);
        expect(w.settledValue).toBe(2);
        const ac = new CycleWindow();
        for (let t = 0; t < 0.01; t += 1e-4) ac.add(t, Math.sin(2 * Math.PI * 30 * t));
        expect(ac.settled).toBe(false);
    });

    it("falls back to the whole window before a full cycle", () => {
        const w = new CycleWindow();
        w.add(0, 0);
        w.add(1, 2);
        expect(w.cycles).toBe(0);
        expect(w.result().avg).toBeCloseTo(1, 9);   // time-weighted
    });
});

function part(x: number, y: number, x2: number, y2: number, extra: Partial<MeterElm> = {}): MeterElm {
    return {
        x, y, x2, y2,
        getPostCount: () => 2,
        getPost: (n) => (n === 0 ? { x, y } : { x: x2, y: y2 }),
        getPostVoltage: () => 0,
        ...extra,
    };
}

describe("findContact", () => {
    const r = part(0, 0, 64, 0, { resistance: 1000 });
    const w = part(64, 0, 64, 128, { isRemovableWire: () => true });

    it("prefers a terminal near the tip", () => {
        const c = findContact([r, w], { x: 62, y: 3 }, 10);
        expect(c?.elm).toBe(r);
        expect(c?.post).toBe(1);
        expect(c?.at).toEqual({ x: 64, y: 0 });
    });

    it("falls back to the nearest point on a wire", () => {
        const c = findContact([r, w], { x: 67, y: 60 }, 10);
        expect(c?.elm).toBe(w);
        expect(c?.at).toEqual({ x: 64, y: 60 });
    });

    it("lets sources touch only terminals and wire ends", () => {
        expect(findContact([r, w], { x: 67, y: 60 }, 10, true)).toBeNull();
        expect(findContact([r, w], { x: 66, y: 126 }, 10, true)?.at).toEqual({ x: 64, y: 128 });
    });

    it("touches nothing out of reach", () => {
        expect(findContact([r, w], { x: 200, y: 200 }, 10)).toBeNull();
    });
});

describe("closestOnSegment", () => {
    it("clamps to the ends", () => {
        expect(closestOnSegment({ x: -5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toEqual({ x: 0, y: 0 });
    });
});

describe("resistanceBetween", () => {
    const r = part(0, 0, 64, 0, { resistance: 4700 });
    const v = part(0, 0, 0, 64);
    it("reads a resistor across its ends", () => {
        expect(resistanceBetween({ elm: r, post: 0, at: r }, { elm: r, post: 1, at: r }, false)).toBe(4700);
    });
    it("reads 0 on one node", () => {
        expect(resistanceBetween({ elm: r, post: 0, at: r }, { elm: v, post: 0, at: v }, true)).toBe(0);
    });
    it("has no reading across parts without a resistance, or across two parts", () => {
        expect(resistanceBetween({ elm: v, post: 0, at: v }, { elm: v, post: 1, at: v }, false)).toBeNaN();
        expect(resistanceBetween({ elm: r, post: 0, at: r }, { elm: v, post: 1, at: v }, false)).toBeNaN();
        expect(resistanceBetween(null, { elm: v, post: 1, at: v }, false)).toBeNaN();
    });
});

describe("formatReading", () => {
    it("auto-ranges with four significant digits", () => {
        expect(formatReading(4.99812, "dcv")).toEqual({ digits: "4.998", unit: "V" });
        expect(formatReading(0.012345, "dca")).toEqual({ digits: "12.35", unit: "mA" });
        expect(formatReading(-0.0003535, "acv")).toEqual({ digits: "-353.5", unit: "µV" });
        expect(formatReading(4700, "ohm")).toEqual({ digits: "4.700", unit: "kΩ" });
    });
    it("shows overload and no reading", () => {
        expect(formatReading(2e4, "dcv").digits).toBe("OL");
        expect(formatReading(NaN, "ohm").digits).toBe("- - - -");
        expect(formatReading(0, "dcv").digits).toBe("0.000");
    });
});
