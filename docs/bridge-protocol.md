# Maestro Simulation Lab: embedding protocol (v1)

How a host page talks to the simulator running in an `<iframe>`. Messages are
plain JSON sent with `window.postMessage`. The host never calls simulator code
directly, and the simulator never runs host code. Clients are written from this
document only.

This document is part of the Levantate Labs fork of CircuitJS1 (GNU GPL, version
2 or later). It describes data exchanged between separate programs; it contains
no simulator code.

## Envelope

Host → simulator:

```json
{ "source": "maestro-sim-host", "v": 1, "type": "init", "id": "req-1", "...": "..." }
```

Simulator → host:

```json
{ "source": "maestro-sim", "v": 1, "type": "initialized", "id": "req-1", "...": "..." }
```

- `v` is the protocol version. A message with another major version is
  answered with an `error` (`code: "bad-version"`).
- `id` is optional on requests; replies to a request carry the same `id`.
- Unknown `type`s are answered with `error` (`code: "unknown-type"`).

## Origins

- The simulator accepts host messages only from allowed origins. By default:
  `localhost` / `127.0.0.1` on any port, `https://studywithmaestro.com`,
  `https://*.studywithmaestro.com` and `https://*.levantate.in`. A deployment can
  add more at build time with `VITE_PARENT_ORIGINS` (comma-separated, `*.` for
  subdomains).
- The first accepted `init` fixes the host origin; later replies go only to it.
- `ready` is the only message sent before that, to `"*"`; it carries no data
  beyond versions.
- The served page sets `Content-Security-Policy: frame-ancestors` to the same
  list, so other sites can't frame it.

## Lifecycle

1. Host creates the iframe (`src=".../workspace/"`) and listens for messages.
2. Simulator sends `ready`. A host that started listening late can send `hello`
   to get `ready` again.
3. Host sends `init`. Simulator loads the circuit, applies the settings, replies
   `initialized`, then sends `gradePoints`.
4. While the student works, the simulator sends `changed` (debounced) with the
   whole circuit, for autosave.
5. Host may send `export`, `setReadOnly`, `measure`, `resetStats` at any time.

## Host → simulator

| type | fields | effect |
|---|---|---|
| `hello` | | Simulator replies `ready` |
| `init` | `circuit?` (string, XML or legacy text, ≤ 256 KB), `exam?` (bool), `parts?` (string[] of part class names, e.g. `"ResistorElm"`; omit or `null` for all), `lockStarter?` (bool), `readOnly?` (bool), `theme?` (`"light"` \| `"dark"`), `dotGrid?` (bool), `running?` (bool), `tour?` (bool, default true: show the first-run tour once per device; never shown with `readOnly`), `compact?` (bool, default = `exam`: menu bar only, the toolbar row's tools move to the tool dock), `instruments?` (bool, default true: the multimeter is available) | Loads and configures; replies `initialized` |
| `export` | | Replies `exported` with the current circuit |
| `setReadOnly` | `value` (bool) | Locks or unlocks all editing (e.g. after submit) |
| `getGradePoints` | | Replies `gradePoints` |
| `resetStats` | | Restarts every grading point's statistics |
| `measure` | `points: [{ id, measure }]`, `measure` ∈ `value`, `avg`, `rms`, `max`, `min`, `p2p`, `freq`, `period` | Replies `measured` |

`init` details:

- `exam: true` hides file, tools and example menus, stops saving anything to
  the browser's local storage (clipboard and crash recovery stay in memory), and
  blocks import/export commands. The About / licence link stays available.
- `parts` limits which parts can be added (menus, toolbar, shortcuts, paste).
  Wires are always allowed. Parts in the starter circuit are kept even if not
  in the list.
- `lockStarter: true` locks every part of the loaded circuit, including grading
  points: they can't be selected, moved, edited, rewired or deleted.
- Undo history starts empty after `init`.

## Simulator → host

| type | fields | when |
|---|---|---|
| `ready` | `version` (simulator build), `protocol` (1) | On load, and in reply to `hello` |
| `initialized` | `parts` (effective allow-list or `null`) | Reply to `init` |
| `changed` | `circuit` (XML) | After edits, at most every ~800 ms |
| `exported` | `circuit` (XML) | Reply to `export` |
| `gradePoints` | `points: [{ id, label, kind }]`, `kind` ∈ `node`, `waveform`, `branch`, `power` | After `initialized`, when pins change, reply to `getGradePoints` |
| `measured` | `values: { [pointId]: { [measure]: number \| null } }`, `simTime` (s) | Reply to `measure`; unknown ids and empty readings are `null` |
| `integrity` | `event` (`"copy"`, `"cut"`, `"paste"`, `"blocked"`), `detail?` | Exam mode only, when the student uses the clipboard or a blocked action |
| `error` | `code`, `message` | Bad request; `id` echoed when present |

Error codes: `bad-version`, `unknown-type`, `too-large`, `bad-circuit`,
`not-initialized`.

## What never crosses the boundary

Expected values, tolerances, marks, answers and grading rules stay on the host.
The simulator only reports what it measures.
