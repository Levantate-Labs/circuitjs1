/*
    Copyright (C) 2026 Levantate Labs

    This file is part of the Levantate Labs fork of CircuitJS1, distributed under
    the GNU General Public License, version 2 or (at your option) any later
    version. See COPYING.txt.
*/

import { describe, it, expect } from "vitest";
import { originAllowed } from "./bridge";

const patterns = [
    "http://localhost:*", "https://studywithmaestro.com",
    "https://*.studywithmaestro.com", "https://*.levantate.in", "https://example.org:8443",
];

describe("originAllowed", () => {
    it.each([
        "http://localhost:3100", "http://localhost", "https://studywithmaestro.com",
        "https://app.studywithmaestro.com", "https://courses.levantate.in",
        "https://example.org:8443",
    ])("allows %s", (o) => expect(originAllowed(o, patterns)).toBe(true));

    it.each([
        "https://localhost:3100",              // wrong scheme
        "http://studywithmaestro.com",         // http, not https
        "https://evilstudywithmaestro.com",    // not a subdomain
        "https://levantate.in.evil.com",
        "https://example.org",                 // port must match exactly
        "null",
        "not a url",
    ])("rejects %s", (o) => expect(originAllowed(o, patterns)).toBe(false));
});
