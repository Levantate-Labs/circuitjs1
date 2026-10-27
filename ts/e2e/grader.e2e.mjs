/*
    Copyright (C) 2026 Levantate Labs. Part of the Levantate Labs fork of
    CircuitJS1 (GNU GPL, version 2 or later).

    End-to-end: the grading service (grader/server.mjs) against the built lab.
    Needs `npm run build` first. Run with `npm run test:e2e`.
*/

import { spawn } from "node:child_process";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DIVIDER, here } from "./serve.mjs";

const PORT = 18095 + Math.floor(Math.random() * 1000);
const BASE = `http://127.0.0.1:${PORT}`;
const TOKEN = "e2e-token";
let proc;

const grade = (body, token = TOKEN) => fetch(`${BASE}/grade`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
});

beforeAll(async () => {
    proc = spawn(process.execPath, [path.join(here, "..", "grader", "server.mjs")], {
        env: { ...process.env, PORT: String(PORT), GRADER_TOKEN: TOKEN, GRADER_BROWSER_CHANNEL: process.env.E2E_BROWSER_CHANNEL ?? "" },
        stdio: "inherit",
    });
    for (let i = 0; i < 100; i++) {
        try {
            if ((await fetch(`${BASE}/healthz`)).ok) return;
        } catch { /* not up yet */ }
        await new Promise((r) => setTimeout(r, 300));
    }
    throw new Error("grader did not start");
});

afterAll(() => proc?.kill());

describe("grading service", () => {
    it("refuses requests without the right token", async () => {
        const body = { circuit: DIVIDER, settle: 0, window: 0.01, points: [] };
        expect((await grade(body, "wrong")).status).toBe(401);
        expect((await grade(body, null)).status).toBe(401);
    });

    it("measures a divider, the same way every time", async () => {
        const body = { circuit: DIVIDER, settle: 0.01, window: 0.02, points: [{ id: "gp_vout", measure: "avg" }, { id: "gp_ir1", measure: "avg" }] };
        const [a, b] = await Promise.all([grade(body).then((r) => r.json()), grade(body).then((r) => r.json())]);
        expect(a.ok).toBe(true);
        expect(a.values.gp_vout.avg).toBeCloseTo(5, 6);
        expect(a.values.gp_ir1.avg).toBeCloseTo(0.005, 9);
        expect(b.values).toEqual(a.values);
        expect(a.points.map((p) => p.id).sort()).toEqual(["gp_ir1", "gp_vout"]);
    });

    it("measures an AC signal's RMS and frequency", async () => {
        const ac = DIVIDER.replace("v 96 336 96 96 0 0 40 10", "v 96 336 96 96 0 1 50 10");
        const r = await grade({ circuit: ac, settle: 0.02, window: 0.1, points: [{ id: "gp_vout", measure: "rms" }, { id: "gp_vout", measure: "freq" }] }).then((x) => x.json());
        expect(r.values.gp_vout.rms).toBeCloseTo(10 / 2 / Math.SQRT2, 3);
        expect(r.values.gp_vout.freq).toBeCloseTo(50, 3);
    });

    it("explains bad requests instead of running them", async () => {
        const r = await grade({ circuit: DIVIDER, settle: 6, window: 6, points: [] }).then((x) => x.json());
        expect(r.ok).toBe(false);
        expect(r.error.code).toBe("bad-request");
    });
});
