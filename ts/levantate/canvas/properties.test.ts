/*
    Copyright (C) 2026 Levantate Labs

    This file is part of the Levantate Labs fork of CircuitJS1, distributed under
    the GNU General Public License, version 2 or (at your option) any later
    version. See COPYING.txt.
*/

import { describe, expect, it } from "vitest";
import { infoRows, parseInfoLine } from "./properties";

describe("parseInfoLine", () => {
    it("splits name = value lines", () => {
        expect(parseInfoLine("I = 2.5 mA")).toEqual({ label: "I", value: "2.5 mA" });
        expect(parseInfoLine("Vd = -1.2 V")).toEqual({ label: "Vd", value: "-1.2 V" });
    });

    it("keeps lines without a value as notes", () => {
        expect(parseInfoLine("forward biased")).toEqual({ note: "forward biased" });
    });
});

describe("infoRows", () => {
    it("drops the part name and empty lines", () => {
        const src = { getInfo: (a: string[]) => { a[0] = "resistor"; a[1] = "I = 1 mA"; a[3] = "R = 1 kΩ"; } };
        expect(infoRows(src)).toEqual([
            { label: "I", value: "1 mA" },
            { label: "R", value: "1 kΩ" },
        ]);
    });

    it("returns nothing when the part can't describe itself", () => {
        expect(infoRows({ getInfo: () => { throw new Error("not stamped"); } })).toEqual([]);
    });
});
