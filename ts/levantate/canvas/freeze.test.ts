/*
    Copyright (C) 2026 Levantate Labs

    This file is part of the Levantate Labs fork of CircuitJS1, distributed under
    the GNU General Public License, version 2 or (at your option) any later
    version. See COPYING.txt.
*/

import { describe, expect, it } from "vitest";
import { labelNormal, overlaps } from "./freeze";

describe("labelNormal", () => {
    it("puts labels below horizontal parts, whichever way they were drawn", () => {
        expect(labelNormal(100, 0)).toEqual({ x: -0, y: 1 });
        expect(labelNormal(-100, 0)).toEqual({ x: 0, y: 1 });
    });

    it("puts labels right of vertical parts, whichever way they were drawn", () => {
        expect(labelNormal(0, 100).x).toBe(1);
        expect(labelNormal(0, -100).x).toBe(1);
    });
});

describe("overlaps", () => {
    const a = { x: 0, y: 0, w: 10, h: 10 };
    it("detects overlapping rectangles", () => {
        expect(overlaps(a, { x: 5, y: 5, w: 10, h: 10 })).toBe(true);
    });
    it("treats touching edges as clear", () => {
        expect(overlaps(a, { x: 10, y: 0, w: 10, h: 10 })).toBe(false);
    });
});
