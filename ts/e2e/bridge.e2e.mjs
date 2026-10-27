/*
    Copyright (C) 2026 Levantate Labs. Part of the Levantate Labs fork of
    CircuitJS1 (GNU GPL, version 2 or later).

    End-to-end: a host page on another origin drives the built lab through the
    embedding protocol (docs/bridge-protocol.md), as Maestro does in a test.
    Needs `npm run build` first. Run with `npm run test:e2e`.
*/

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DIVIDER, dist, here, launch, serveDir } from "./serve.mjs";

let lab, host, browser, page, frame;

const resistorsIn = (xml) => (xml.match(/<r /g) || []).length;

const exportCircuit = () => page.evaluate(async () => {
    const n = window.received.length;
    window.send("export");
    return (await window.waitFor("exported", n)).circuit;
});

beforeAll(async () => {
    lab = await serveDir(dist);
    host = await serveDir(here);
    browser = await launch();
    page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
    await page.goto(`${host.origin}/host.html?lab=${encodeURIComponent(lab.origin + "/workspace/")}`);
    await page.evaluate(() => window.waitFor("ready"));
    frame = page.frames().find((f) => f.url().includes("/workspace/"));
});

afterAll(async () => {
    await browser?.close();
    await lab?.close();
    await host?.close();
});

describe("embedding protocol", () => {
    it("loads an exam with locked starter parts and grading points", async () => {
        const [initialized, points] = await page.evaluate(async (circuit) => {
            const n = window.received.length;
            window.send("init", { circuit, exam: true, lockStarter: true, parts: ["ResistorElm"], tour: false, running: true });
            return [await window.waitFor("initialized", n), await window.waitFor("gradePoints", n)];
        }, DIVIDER);
        expect(initialized.parts).toEqual(["ResistorElm"]);
        expect(points.points.map((p) => p.id).sort()).toEqual(["gp_ir1", "gp_vout"]);
    });

    it("shows the compact bar: no toolbar row, undo/redo and the allowed parts in the dock", async () => {
        const ui = await frame.evaluate(() => ({
            toolbar: getComputedStyle(document.querySelector(".mainToolbar")).display,
            dock: [...document.querySelectorAll(".toolDockButton")]
                .filter((b) => !b.classList.contains("lvHidden")).map((b) => b.title.split(" (")[0]),
        }));
        expect(ui.toolbar).toBe("none");
        expect(ui.dock).toEqual(expect.arrayContaining(["Undo", "Redo", "Add Wire", "Add Resistor", "Instruments"]));
        expect(ui.dock).not.toContain("Add Grading Point");
        expect(ui.dock).not.toContain("Add Capacitor");
    });

    it("measures the grading points of the running circuit", async () => {
        await page.waitForTimeout(800);
        const m = await page.evaluate(async () => {
            const n = window.received.length;
            window.send("measure", { points: [{ id: "gp_vout", measure: "value" }, { id: "gp_ir1", measure: "value" }, { id: "nope", measure: "avg" }] });
            return window.waitFor("measured", n);
        });
        expect(m.values.gp_vout.value).toBeCloseTo(5, 3);
        expect(m.values.gp_ir1.value).toBeCloseTo(0.005, 6);
        expect(m.values.nope.avg).toBeNull();
    });

    it("lets the student add a part, and undo keeps the starter's parts", async () => {
        expect(resistorsIn(await exportCircuit())).toBe(2);

        // pick the resistor in the dock and drag one out on an empty part of the canvas
        await (await frame.$(".toolDockButton[title^='Add Resistor']")).click();
        const canvas = await (await frame.$(".canvasWrapper > canvas")).boundingBox();
        const x = canvas.x + canvas.width - 160, y = canvas.y + 100;
        const n = await page.evaluate(() => window.received.length);
        await page.mouse.move(x, y);
        await page.mouse.down();
        await page.mouse.move(x + 96, y, { steps: 8 });
        await page.mouse.up();
        const changed = await page.evaluate((after) => window.waitFor("changed", after), n);
        expect(resistorsIn(changed.circuit)).toBe(3);

        await (await frame.$(".toolDockButton[title^='Undo']")).click();
        const after = await exportCircuit();
        expect(resistorsIn(after)).toBe(2);
        expect(after).toContain("LvGradePoint");   // grading points survive undo
        expect(after).toMatch(/<v /);                // so does the source, though it isn't an allowed part
    });

    it("hides the dock when the host makes the lab read-only", async () => {
        await page.evaluate(() => window.send("setReadOnly", { value: true }));
        await page.waitForTimeout(300);
        const hidden = await frame.evaluate(() => document.querySelector(".toolDock").classList.contains("lvHidden"));
        expect(hidden).toBe(true);
    });
});
