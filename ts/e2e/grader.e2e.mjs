/*
    Copyright (C) 2026 Levantate Labs. Part of the Levantate Labs fork of
    CircuitJS1 (GNU GPL, version 2 or later).

    End-to-end: the grading service (grader/server.mjs) against the built lab.
    Needs `npm run build` first. Run with `npm run test:e2e`.
*/

import { spawn } from "node:child_process";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DIVIDER, here, sealedDivider } from "./serve.mjs";

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

    it("grades a frequency response with ngspice", async () => {
        const rc = `$ 1 0.000005 10.2 50 5 43 5e-11
v 96 336 96 96 0 1 1000 5 0 0 0.5
r 96 96 256 96 0 1000
c 256 96 256 336 0 1e-7 0
w 96 336 256 336 0
4000 256 96 336 48 0 node gp_out Vout
`;
        const r = await grade({ analysis: "ac", circuit: rc, out: "gp_out", from: 1, to: 1e6,
            measures: ["gain_db@1000", "phase@1591.5", "f3db_high", "peak_db"] }).then((x) => x.json());
        expect(r.ok).toBe(true);
        const fc = 1 / (2 * Math.PI * 1000 * 1e-7);
        expect(r.values["gain_db@1000"]).toBeCloseTo(-10 * Math.log10(1 + (1000 / fc) ** 2), 2);
        expect(r.values["phase@1591.5"]).toBeCloseTo(-45, 0);
        expect(Math.abs(r.values.f3db_high - fc) / fc).toBeLessThan(0.01);
        expect(r.values.peak_db).toBeCloseTo(0, 3);
        const bad = await grade({ analysis: "ac", circuit: rc, out: "gp_out", from: 1, to: 1e6, measures: ["median"] }).then((x) => x.json());
        expect(bad.error.code).toBe("bad-request");
    }, 90_000);

    it("simulates sealed parts' faults", async () => {
        const points = [{ id: "gp_vout", measure: "avg" }, { id: "gp_ir1", measure: "avg" }];
        const run = (circuit) => grade({ circuit, settle: 0.01, window: 0.02, points }).then((r) => r.json());
        const [healthy, open, short] = await Promise.all(["", "open", "short"].map((f) => run(sealedDivider(f))));
        expect(healthy.values.gp_vout.avg).toBeCloseTo(5, 6);
        expect(open.values.gp_vout.avg).toBeCloseTo(10, 4);
        expect(Math.abs(open.values.gp_ir1.avg)).toBeLessThan(1e-6);
        expect(Math.abs(short.values.gp_vout.avg)).toBeLessThan(1e-3);
        expect(short.values.gp_ir1.avg).toBeCloseTo(0.01, 5);
        // a diode fitted backwards conducts nothing
        const diode = (fault) => `<cir f="1" ts="0.000005" ic="10.2" cb="50" pb="50" vr="5" mts="5e-11">
  <v x="96 336 96 96" f="0" wf="0" maxv="10"/>
  <r x="96 96 256 96" f="0" r="1000"/>
  <d x="256 96 256 336" f="2" lvSeal="D1"${fault ? ` lvFault="${fault}"` : ""}/>
  <w x="96 336 256 336" f="0"/>
  <LvGradePoint x="176 96 176 40" f="0" k="branch" id="gp_i" lb="I"/>
</cir>
`;
        const pts = [{ id: "gp_i", measure: "avg" }];
        const [fwd, rev] = await Promise.all(["", "reversed"].map((f) =>
            grade({ circuit: diode(f), settle: 0.01, window: 0.02, points: pts }).then((r) => r.json())));
        expect(fwd.values.gp_i.avg).toBeGreaterThan(0.009);
        expect(Math.abs(rev.values.gp_i.avg)).toBeLessThan(1e-6);
    });

    it("explains bad requests instead of running them", async () => {
        const r = await grade({ circuit: DIVIDER, settle: 6, window: 6, points: [] }).then((x) => x.json());
        expect(r.ok).toBe(false);
        expect(r.error.code).toBe("bad-request");
    });
});
