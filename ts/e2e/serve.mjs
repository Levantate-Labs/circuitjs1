/*
    Copyright (C) 2026 Levantate Labs. Part of the Levantate Labs fork of
    CircuitJS1 (GNU GPL, version 2 or later).

    End-to-end test helpers: a static file server and the browser.
*/

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const MIME = {
    ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
    ".txt": "text/plain", ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2",
};

// Serves `root` on a free loopback port; resolves to { origin, close }.
export async function serveDir(root) {
    const server = http.createServer((req, res) => {
        let p = decodeURIComponent((req.url || "/").split("?")[0]);
        if (p.endsWith("/")) p += "index.html";
        const file = path.join(root, p);
        if (!file.startsWith(root + path.sep)) return res.writeHead(404).end();
        fs.readFile(file, (err, data) => {
            if (err) return res.writeHead(404).end();
            res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
            res.end(data);
        });
    });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    return { origin: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((r) => server.close(r)) };
}

// E2E_BROWSER_CHANNEL=msedge (or chrome) uses an installed browser; otherwise
// Playwright's own Chromium (installed in the grader image and in CI).
export function launch() {
    return chromium.launch({ channel: process.env.E2E_BROWSER_CHANNEL || undefined });
}

export const here = path.dirname(fileURLToPath(import.meta.url));
export const dist = path.resolve(here, "..", "dist");

export const DIVIDER = `$ 1 0.000005 10.2 50 5 43 5e-11
v 96 336 96 96 0 0 40 10 0 0 0.5
r 96 96 256 96 0 1000
r 256 96 256 336 0 1000
w 96 336 256 336 0
4000 256 96 336 48 0 node gp_vout Vout
4000 176 96 176 40 0 branch gp_ir1 I_R1
`;
