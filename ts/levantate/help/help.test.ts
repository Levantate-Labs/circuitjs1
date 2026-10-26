/*
    Copyright (C) 2026 Levantate Labs

    This file is part of the Levantate Labs fork of CircuitJS1, distributed under
    the GNU General Public License, version 2 or (at your option) any later
    version. See COPYING.txt.
*/

import { describe, expect, it } from "vitest";
import { HELP_SECTIONS, matchesQuery } from "./content";
import { placeCard } from "./tour";

const section = (id: string) => HELP_SECTIONS.find((s) => s.id === id)!;

describe("help search", () => {
    it("matches every word anywhere in a section, ignoring case", () => {
        expect(matchesQuery(section("problems"), "Singular MATRIX")).toBe(true);
        expect(matchesQuery(section("values"), "kilo prefix")).toBe(true);
    });

    it("doesn't match markup, only text", () => {
        expect(matchesQuery(section("values"), "helpTable")).toBe(false);
    });

    it("shows everything for an empty query", () => {
        expect(HELP_SECTIONS.every((s) => matchesQuery(s, "  "))).toBe(true);
    });

    it("has unique section ids", () => {
        expect(new Set(HELP_SECTIONS.map((s) => s.id)).size).toBe(HELP_SECTIONS.length);
    });
});

describe("placeCard", () => {
    const view = { width: 1000, height: 800 };
    const card = { width: 300, height: 200 };

    it("centres the card when there is no target", () => {
        expect(placeCard(null, card, view)).toEqual({ left: 350, top: 300 });
    });

    it("puts the card below a target near the top", () => {
        const p = placeCard({ left: 400, top: 50, width: 200, height: 40 }, card, view);
        expect(p.top).toBe(104);
        expect(p.left).toBe(350);
    });

    it("puts the card above a target near the bottom", () => {
        const p = placeCard({ left: 400, top: 700, width: 200, height: 60 }, card, view);
        expect(p.top).toBe(700 - 14 - 200);
    });

    it("keeps the card inside the window", () => {
        const p = placeCard({ left: 960, top: 50, width: 30, height: 30 }, card, view);
        expect(p.left).toBe(1000 - 300 - 12);
    });
});
