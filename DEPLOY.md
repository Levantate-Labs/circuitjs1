# Deploying the Levantate Labs fork

The app is a static site: `npm run build` writes it to `ts/dist/`, and
`npm start` serves that folder with [serve](https://github.com/vercel/serve)
(MIT) on `$PORT` (default 8080). `ts/serve.json` is copied into `dist/` by the
`postbuild` script; it turns off directory listing and clean URLs, redirects
`/` to `/circuitjs.html`, adds basic security headers and long-term caching for
the hashed JS, CSS and font files.

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
| Settings → Deploy → Healthcheck Path | `/circuitjs.html` |
| Variables | `PORT=8080` |
| Settings → Networking → Public Networking | Generate a domain (or add a custom one, e.g. `sim.levantate.in`) with target port `8080` |

Node: `engines.node` is `>=22.12` (required by Vite 8).

## Locally

```bash
cd ts
npm ci
npm run build
PORT=8080 npm start
```

Then open http://localhost:8080/. On Windows `cmd`, `${PORT:-8080}` in the
start script is not expanded; run it from Git Bash, or call
`npx serve dist --listen tcp://0.0.0.0:8080` directly.

## Licence reminder

Every deployed build is a distribution of GPL software. Deploy only from a
pushed git tag or commit on the public fork, so the About dialog and
`CHANGES.md` point at source that matches what is served.
