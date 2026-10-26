/*
    Copyright (C) 2026 Levantate Labs

    This file is part of the Levantate Labs fork of CircuitJS1, distributed under
    the GNU General Public License, version 2 or (at your option) any later
    version. See COPYING.txt.
*/

import { describe, expect, it } from "vitest";
import { LIMITS, validateRequest } from "./runner";

const ok = { circuit: "$ 1 0.000005 10 50 5 43\n", settle: 0.01, window: 0.02, points: [] };

describe("validateRequest", () => {
    it("accepts a normal request", () => {
        expect(validateRequest(ok)).toBeNull();
    });

    it("needs a circuit", () => {
        expect(validateRequest({ ...ok, circuit: "  " })).toMatch(/circuit/);
    });

    it("refuses circuits over the size limit", () => {
        expect(validateRequest({ ...ok, circuit: "x".repeat(LIMITS.maxCircuitChars + 1) })).toMatch(/too large/);
    });

    it("needs a measuring window and caps simulated time", () => {
        expect(validateRequest({ ...ok, window: 0 })).toMatch(/window/);
        expect(validateRequest({ ...ok, settle: -1 })).toMatch(/settle/);
        expect(validateRequest({ ...ok, settle: 6, window: 6 })).toMatch(/more than/);
    });

    it("caps the number of points", () => {
        const points = Array.from({ length: LIMITS.maxPoints + 1 }, (_, i) => ({ id: "p" + i, measure: "avg" }));
        expect(validateRequest({ ...ok, points })).toMatch(/points/);
    });
});
