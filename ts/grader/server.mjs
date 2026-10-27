/*
    Copyright (C) 2026 Levantate Labs

    This file is part of the Levantate Labs fork of CircuitJS1, distributed under
    the GNU General Public License, version 2 or (at your option) any later
    version. See COPYING.txt.
*/

// Grading service (roadmap slice L6). Runs circuits in the real Simulation Lab
// in headless Chromium and returns grading-point readings:
//
//   POST /grade   Authorization: Bearer <GRADER_TOKEN>
//   { "circuit": "...", "settle": 0.05, "window": 0.05,
//     "points": [{ "id": "gp_vout", "measure": "avg" }] }
//   -> { "ok": true, "values": { "gp_vout": { "avg": 5 } }, "simTime": 0.1,
//        "steps": 20001, "points": [{ "id": "gp_vout", "label": "Vout", "kind": "node" }] }
//
//   GET /healthz  -> 200 "ok" once the browser is up
//
// It only measures. Expected values, tolerances and marks stay with the caller.
// Serves the built app (dist/) to the browser itself on a loopback port, loads
// it with ?grader=1 (levantate/grader/runner.ts) and blocks every other request
// the page makes. The page is reloaded for every circuit.
//
// Environment:
//   PORT                   listen port (default 8090)
//   GRADER_TOKEN           required bearer token (unless GRADER_DEV=1)
//   GRADER_CONCURRENCY     browser pages working at once (default 2)
//   GRADER_BROWSER_CHANNEL e.g. "msedge" or "chrome" to use an installed browser
//   GRADER_DIST            built app folder (default ../dist)

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const here = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(process.env.GRADER_DIST || path.join(here, "..", "dist"));
const PORT = Number(process.env.PORT || 8090);
const TOKEN = process.env.GRADER_TOKEN || "";
const DEV = process.env.GRADER_DEV === "1";
const CONCURRENCY = Math.max(1, Number(process.env.GRADER_CONCURRENCY || 2));
const MAX_BODY = 600 * 1024;
const JOB_TIMEOUT_MS = 45_000;

if (!TOKEN && !DEV) {
    console.error("GRADER_TOKEN is required (or GRADER_DEV=1 for local testing)");
    process.exit(1);
}
if (!fs.existsSync(path.join(DIST, "workspace", "index.html"))) {
    console.error(`no built app at ${DIST}/workspace/index.html; run "npm run build" first`);
    process.exit(1);
}

// ---- the app, served to our own browser only ----

const MIME = {
    ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json",
    ".txt": "text/plain", ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2",
    ".woff": "font/woff", ".ttf": "font/ttf", ".ico": "image/x-icon", ".gif": "image/gif", ".jpg": "image/jpeg",
};

const appServer = http.createServer((req, res) => {
    let p = decodeURIComponent((req.url || "/").split("?")[0]);
    if (p.endsWith("/")) p += "index.html";
    const file = path.join(DIST, p);
    if (!file.startsWith(DIST + path.sep)) {
        res.writeHead(404).end();
        return;
    }
    fs.readFile(file, (err, data) => {
        if (err) {
            res.writeHead(404).end();
            return;
        }
        res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
        res.end(data);
    });
});
await new Promise((r) => appServer.listen(0, "127.0.0.1", r));
const APP_ORIGIN = `http://127.0.0.1:${appServer.address().port}`;
const APP_URL = `${APP_ORIGIN}/workspace/?grader=1&tour=0`;

// ---- browser pages ----

const browser = await chromium.launch({ channel: process.env.GRADER_BROWSER_CHANNEL || undefined });

async function newPage() {
    const page = await browser.newPage();
    // the page may only load the app itself
    await page.route("**/*", (route) =>
        route.request().url().startsWith(APP_ORIGIN + "/") ? route.continue() : route.abort());
    return page;
}

const idle = [];
for (let i = 0; i < CONCURRENCY; i++) idle.push(await newPage());
const waiting = [];

async function withPage(fn) {
    const page = idle.pop() ?? (await new Promise((r) => waiting.push(r)));
    let keep = page;
    try {
        return await fn(page);
    } catch (e) {
        // a stuck or crashed page is replaced, never reused
        await page.close().catch(() => {});
        keep = await newPage();
        throw e;
    } finally {
        const next = waiting.shift();
        if (next) next(keep);
        else idle.push(keep);
    }
}

function timeout(ms) {
    return new Promise((_, reject) => setTimeout(() => reject(new Error("timed out")), ms));
}

async function grade(request, analysis = "transient") {
    return withPage(async (page) => {
        const work = (async () => {
            await page.goto(APP_URL, { waitUntil: "load" });
            await page.waitForFunction(() => window.LvGrader != null, null, { timeout: 20_000 });
            if (analysis === "ac")
                return page.evaluate((req) => window.LvGrader.ac(req), request);
            return page.evaluate((req) => window.LvGrader.run(req), request);
        })();
        return Promise.race([work, timeout(JOB_TIMEOUT_MS)]);
    });
}

// ---- API ----

function authorized(req) {
    if (DEV && !TOKEN) return true;
    const got = Buffer.from(req.headers.authorization || "");
    const want = Buffer.from(`Bearer ${TOKEN}`);
    return got.length === want.length && crypto.timingSafeEqual(got, want);
}

function send(res, status, body) {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
}

function readBody(req) {
    return new Promise((resolve, reject) => {
        let size = 0;
        const chunks = [];
        req.on("data", (c) => {
            size += c.length;
            if (size > MAX_BODY) {
                reject(Object.assign(new Error("request too large"), { status: 413 }));
                req.destroy();
                return;
            }
            chunks.push(c);
        });
        req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
        req.on("error", reject);
    });
}

const api = http.createServer(async (req, res) => {
    if (req.method === "GET" && req.url === "/healthz") {
        res.writeHead(200, { "Content-Type": "text/plain" }).end("ok");
        return;
    }
    if (req.method !== "POST" || req.url !== "/grade") {
        send(res, 404, { error: "not found" });
        return;
    }
    if (!authorized(req)) {
        send(res, 401, { error: "unauthorized" });
        return;
    }
    let body;
    try {
        body = JSON.parse(await readBody(req));
    } catch (e) {
        send(res, e.status || 400, { error: e.status ? e.message : "body must be JSON" });
        return;
    }
    const started = Date.now();
    try {
        const result = body.analysis === "ac"
            ? await grade({
                circuit: body.circuit, out: body.out, ref: body.ref ?? null, input: body.input ?? null,
                from: body.from, to: body.to, perDecade: body.perDecade, measures: body.measures,
            }, "ac")
            : await grade({
                circuit: body.circuit,
                settle: body.settle,
                window: body.window,
                points: body.points,
            });
        console.log(`grade ok=${result.ok} steps=${result.steps} ${Date.now() - started}ms`);
        send(res, 200, result);
    } catch (e) {
        console.error("grade failed:", e.message);
        send(res, 503, { error: "the grader could not run this circuit, try again" });
    }
});

api.listen(PORT, () => console.log(`grader listening on :${PORT} (${CONCURRENCY} pages)`));

for (const sig of ["SIGINT", "SIGTERM"])
    process.on(sig, async () => {
        api.close();
        await browser.close().catch(() => {});
        process.exit(0);
    });
