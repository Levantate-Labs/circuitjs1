/*
    Copyright (C) 2026 Levantate Labs

    This file is part of the Levantate Labs fork of CircuitJS1, distributed under
    the GNU General Public License, version 2 or (at your option) any later
    version. See COPYING.txt.
*/

import { describe, expect, it } from "vitest";
import { bodePoints, summarize, valueAt } from "./bode";

// an RC low-pass, H = 1 / (1 + j f/fc), sampled 20 points per decade
function lowPass(fc: number) {
    const freq: number[] = [], h: { real: number; img: number }[] = [];
    for (let k = 0; k <= 120; k++) {
        const f = 10 ** (k / 20);   // 1 Hz .. 1 MHz
        const x = f / fc, d = 1 + x * x;
        freq.push(f);
        h.push({ real: 1 / d, img: -x / d });
    }
    return bodePoints(freq, h, null);
}

describe("bode", () => {
    it("computes gain and phase", () => {
        const p = lowPass(1000);
        expect(valueAt(p, 1000, "gainDb")).toBeCloseTo(-3.0103, 2);
        expect(valueAt(p, 1000, "phaseDeg")).toBeCloseTo(-45, 1);
        expect(valueAt(p, 1, "gainDb")).toBeCloseTo(0, 3);
    });

    it("finds the -3 dB cutoff", () => {
        const s = summarize(lowPass(1591.5));
        expect(s.highCutoff!).toBeGreaterThan(1550);
        expect(s.highCutoff!).toBeLessThan(1630);
        expect(s.lowCutoff).toBeNull();
        expect(s.peakDb).toBeCloseTo(0, 3);
    });

    it("subtracts the reference node and unwraps the phase", () => {
        const freq = [1, 10, 100];
        const plus = [{ real: 0, img: 1 }, { real: -1, img: 0.01 }, { real: 0, img: -1 }];
        const p = bodePoints(freq, plus, null);
        expect(p.map((x) => Math.round(x.phaseDeg))).toEqual([90, 179, 270]);
        const diff = bodePoints([1], [{ real: 3, img: 0 }], [{ real: 1, img: 0 }]);
        expect(diff[0].gainDb).toBeCloseTo(20 * Math.log10(2), 6);
    });
});
