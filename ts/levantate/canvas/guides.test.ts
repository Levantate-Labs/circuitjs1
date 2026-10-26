/*
    Copyright (C) 2026 Levantate Labs

    This file is part of the Levantate Labs fork of CircuitJS1, distributed under
    the GNU General Public License, version 2 or (at your option) any later
    version. See COPYING.txt.
*/

import { describe, it, expect } from "vitest";
import { findGuides, splitPosts, moveText } from "./guides";

const elm = (pts: [number, number][], selected = false) => ({
    getPostCount: () => pts.length,
    getPost: (n: number) => ({ x: pts[n][0], y: pts[n][1] }),
    isSelected: () => selected,
});

describe("findGuides", () => {
    it("finds vertical and horizontal alignments", () => {
        const g = findGuides([{ x: 64, y: 32 }], [{ x: 64, y: 160 }, { x: 200, y: 32 }, { x: 10, y: 10 }]);
        expect(g).toContainEqual({ vertical: true, pos: 64, from: 32, to: 160 });
        expect(g).toContainEqual({ vertical: false, pos: 32, from: 64, to: 200 });
        expect(g).toHaveLength(2);
    });

    it("merges terminals on the same line into one guide", () => {
        const g = findGuides([{ x: 0, y: 0 }, { x: 0, y: 48 }], [{ x: 0, y: 96 }, { x: 0, y: -32 }]);
        expect(g).toEqual([{ vertical: true, pos: 0, from: -32, to: 96 }]);
    });

    it("ignores a terminal sitting exactly on top of another (that's a connection)", () => {
        expect(findGuides([{ x: 5, y: 5 }], [{ x: 5, y: 5 }])).toEqual([]);
    });
});

describe("splitPosts", () => {
    const a = elm([[0, 0], [64, 0]], true);
    const b = elm([[0, 96], [64, 96]]);

    it("moves selected parts' terminals", () => {
        const { moving, fixed } = splitPosts([a, b], "selection", null, null, -1);
        expect(moving).toHaveLength(2);
        expect(fixed).toHaveLength(2);
    });

    it("moves only the dragged terminal of a part", () => {
        const { moving, fixed } = splitPosts([a, b], "post", null, a, 1);
        expect(moving).toEqual([{ x: 64, y: 0 }]);
        expect(fixed).toContainEqual({ x: 0, y: 0 });   // the part's other end stays
        expect(fixed).toHaveLength(3);
    });

    it("counts an unselected part dragged by the cursor as moving", () => {
        const loose = elm([[0, 200], [64, 200]]);
        const { moving } = splitPosts([a, b, loose], "selection", null, null, -1, new Set([loose]));
        expect(moving).toContainEqual({ x: 0, y: 200 });
        expect(moving).toHaveLength(4);   // a (selected) + loose
    });

    it("treats the part being placed as moving", () => {
        const placing = elm([[128, 0], [128, 64]]);
        const { moving, fixed } = splitPosts([a, b], "place", placing, null, -1);
        expect(moving).toHaveLength(2);
        expect(fixed).toHaveLength(4);
    });
});

describe("moveText", () => {
    it("shows direction and grid squares", () => {
        expect(moveText(3, 0)).toBe("→ 3");
        expect(moveText(-2, 4)).toBe("← 2  ↓ 4");
        expect(moveText(0, -1)).toBe("↑ 1");
        expect(moveText(0, 0)).toBe("0");
    });
});
