/*
    Copyright (C) 2026 Levantate Labs

    This file is part of the Levantate Labs fork of CircuitJS1, distributed under
    the GNU General Public License, version 2 or (at your option) any later
    version. See COPYING.txt.
*/

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BLANK_FILE, startCircuit } from "./welcome";

describe("start circuit", () => {
    beforeEach(() => {
        const store = new Map<string, string>();
        vi.stubGlobal("localStorage", {
            getItem: (k: string) => store.get(k) ?? null,
            setItem: (k: string, v: string) => { store.set(k, v); },
        });
    });
    afterEach(() => { vi.unstubAllGlobals(); });

    it("opens the welcome on the first visit, then a blank canvas", () => {
        expect(startCircuit("maestro-welcome.txt", "Welcome", true, false).file).toBe("maestro-welcome.txt");
        expect(startCircuit("maestro-welcome.txt", "Welcome", true, false).file).toBe(BLANK_FILE);
    });

    it("doesn't count the welcome as seen until it is opened", () => {
        expect(startCircuit("maestro-welcome.txt", "Welcome", false, false).file).toBe("maestro-welcome.txt");
        expect(startCircuit("maestro-welcome.txt", "Welcome", true, false).file).toBe("maestro-welcome.txt");
    });

    it("starts blank inside a host page without counting a visit", () => {
        expect(startCircuit("maestro-welcome.txt", "Welcome", true, true).file).toBe(BLANK_FILE);
        expect(startCircuit("maestro-welcome.txt", "Welcome", true, false).file).toBe("maestro-welcome.txt");
    });

    it("still opens the welcome when storage is blocked", () => {
        vi.stubGlobal("localStorage", {
            getItem: () => { throw new Error("blocked"); },
            setItem: () => { throw new Error("blocked"); },
        });
        expect(startCircuit("maestro-welcome.txt", "Welcome", true, false).file).toBe("maestro-welcome.txt");
    });
});
