# Deploying the Levantate Labs fork

The app is a static site served at **`/workspace/`**. `npm run build` writes it
to `ts/dist/workspace/` (the page is `index.html`), and `npm start` serves
`ts/dist/` with [serve](https://github.com/vercel/serve) (MIT) on `$PORT`
(default 8080). `ts/serve.json` is copied into `dist/` by the `postbuild`
script; it:

- redirects `/` and the old `/circuitjs.html` to `/workspace/`, and
  `/workspace` to `/workspace/` (the trailing slash matters: the app loads its
  files relative to the page);
- serves `/workspace/` from `workspace/index.html` (serve wants rewrite
  sources without a leading slash);
- turns off directory listing and extension-less URLs;
- adds basic security headers and a one-year cache for the hashed JS, CSS and
  font files.

To use a different path, change `appDir` in `ts/vite.config.ts` and the paths
in `ts/serve.json`.

## Railway

No `railway.json` / `railway.toml`: Railway's config-as-code files are
deprecated (new services can't opt in, existing files stop being read on
2026-12-01). Railway's builder (Railpack) detects the Node app and runs the
`build` and `start` scripts from `ts/package.json`, so the dashboard settings
below are all that's needed.

| Setting | Value |
|---|---|
| Source | GitHub repo `Levantate-Labs/circuitjs1`, branch `levantate` |
| Settings → Source → Root Directory | `ts` |
| Settings → Build → Builder | Railpack (default) |
| Settings → Build → Build Command | `npm run build` (Railpack runs `npm ci` first; leave empty to use the script automatically) |
| Settings → Deploy → Start Command | `npm start` (or leave empty) |
| Settings → Deploy → Healthcheck Path | `/workspace/` |
| Variables | `PORT=8080` |
| Settings → Networking → Public Networking | Generate a domain (or add a custom one, e.g. `sim.levantate.in`) with target port `8080` |

Node: `engines.node` is `>=22.12` (required by Vite 8).

### If the build fails right after "using build driver railpack"

Check **Root Directory** first. Without it Railway builds from the repo root,
which has no `package.json`, and Railpack stops with
`Railpack could not determine how to build the app.` Checked on 2026-10-26 with
the same Railpack version Railway used (v0.43.0):

| Root Directory | Railpack result |
|---|---|
| (empty) | ✖ could not determine how to build the app |
| `ts` | Node 22.x, `npm install`, `npm run build`, start `npm run start` |

To reproduce locally (Docker), with the Linux Railpack binary unpacked in
`<rp>`:

```bash
docker run --rm -v <rp>:/rp:ro -v "$PWD":/app:ro alpine:3.20 /rp/railpack info /app/ts
```

## Locally

```bash
cd ts
npm ci
npm run build
PORT=8080 npm start
```

Then open http://localhost:8080/ (redirects to `/workspace/`). On Windows `cmd`, `${PORT:-8080}` in the
start script is not expanded; run it from Git Bash, or call
`npx serve dist --listen tcp://0.0.0.0:8080` directly.

## Licence reminder

Every deployed build is a distribution of GPL software. Deploy only from a
pushed git tag or commit on the public fork, so the About dialog and
`CHANGES.md` point at source that matches what is served.
