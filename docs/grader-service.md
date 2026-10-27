# Maestro Simulation Lab: grading service

A small HTTP service that runs a circuit in the real Simulation Lab (headless
Chromium) for a fixed amount of simulated time and returns what its grading
points measured. A host's backend uses it to mark circuit answers without
trusting anything a student's browser reports.

This document is part of the Levantate Labs fork of CircuitJS1 (GNU GPL, version
2 or later). The service only measures: expected values, tolerances and marks
stay with the caller and are never sent here.

## How a circuit is run

1. The circuit is loaded into a fresh page (`/workspace/?grader=1`).
2. The simulation is stepped with a fake clock so that every step is exactly one
   simulator time step, independent of the machine's speed, until the
   simulated time reaches `settle`. The same request always gives the same
   readings.
3. Every grading point's statistics are reset.
4. The simulation runs on through `window` more seconds.
5. The requested measures are read from the grading points.

Code: `ts/levantate/grader/runner.ts` (the in-page runner) and
`ts/grader/server.mjs` (the service).

## API

`POST /grade` with `Authorization: Bearer <GRADER_TOKEN>`:

```json
{
  "circuit": "<XML or legacy text, at most 256 KB>",
  "settle": 0.05,
  "window": 0.05,
  "points": [{ "id": "gp_vout", "measure": "avg" }]
}
```

`measure` is one of `value`, `avg`, `rms`, `max`, `min`, `p2p`, `freq`,
`period` (see `docs/bridge-protocol.md`). Reply (HTTP 200):

```json
{
  "ok": true,
  "values": { "gp_vout": { "avg": 5 } },
  "simTime": 0.1,
  "steps": 20001,
  "points": [{ "id": "gp_vout", "label": "Vout", "kind": "node" }]
}
```

- A requested point that isn't in the circuit, or a reading that doesn't exist
  (e.g. the frequency of a constant), is `null`.
- `points` lists the grading points the circuit actually has.
- When the circuit can't be run, `ok` is `false` and `error` says why:

| `error.code` | meaning |
|---|---|
| `bad-request` | missing circuit, bad times, too many points |
| `bad-circuit` | the circuit text could not be read |
| `sim-stopped` | the simulator stopped (e.g. "Singular matrix!"); `message` has its text |
| `too-slow` | more than 4,000,000 steps or 30 s of work |

Limits: `settle + window` ≤ 10 s of simulated time, ≤ 200 points, 600 KB body.
HTTP errors: `401` bad token, `413` body too large, `503` the browser failed
(safe to retry).

### Frequency response (`"analysis": "ac"`)

An AC analysis in ngspice (the circuit is exported as a SPICE netlist,
`ts/levantate/spice/`), read at a grading point:

```json
{
  "analysis": "ac",
  "circuit": "…",
  "out": "gp_vout",
  "ref": null,
  "input": null,
  "from": 1, "to": 1000000, "perDecade": 40,
  "measures": ["gain_db@1000", "phase@1000", "peak_db", "peak_f", "f3db_low", "f3db_high"]
}
```

- `out`: the grading point whose node is the output; `ref`: a second point to
  measure against (default ground).
- `input`: which voltage source to sweep, in circuit order; by default the
  first AC source (or the first source).
- Reply: `{ "ok": true, "values": { "gain_db@1000": -1.47, … }, "unsupported": [], "points": [...] }`.
  Gain in dB, phase in degrees, frequencies in Hz; a reading that doesn't exist
  (e.g. no −3 dB point in range) is `null`. Parts SPICE can't express are left
  out and listed in `unsupported`.
- Errors (`ok: false`): `bad-request`, `bad-circuit`, `no-point` (the pin is
  missing or appears twice), `no-input`, `spice` (ngspice's message).

`GET /healthz` answers `ok` once the browser is running.

## Running it

```bash
cd ts
npm ci
npm run build
GRADER_TOKEN=change-me node grader/server.mjs
```

| Variable | Meaning |
|---|---|
| `PORT` | listen port (default 8090) |
| `GRADER_TOKEN` | bearer token callers must send (required) |
| `GRADER_CONCURRENCY` | pages grading at once (default 2) |
| `GRADER_BROWSER_CHANNEL` | use an installed browser, e.g. `msedge` or `chrome` (local runs) |
| `GRADER_DEV=1` | allow running without a token (local only) |

Locally, without Playwright's own browser download, use an installed browser:
`GRADER_DEV=1 GRADER_BROWSER_CHANNEL=msedge node grader/server.mjs`.

The page may only load the app itself; every other request it makes is
blocked.

## Deploying (Railway)

A second service from the same repository:

| Setting | Value |
|---|---|
| Root Directory | `ts` |
| Builder | Dockerfile, path `grader/Dockerfile` |
| Variables | `GRADER_TOKEN` (a long random string), `PORT=8090` |
| Networking | private networking only; the backend calls it over Railway's internal network |
| Healthcheck Path | `/healthz` |

The image is `mcr.microsoft.com/playwright` at the same version as
`playwright-core` in `ts/package.json`; update both together.
