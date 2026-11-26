# Micro-Beta — web

Mobile-first front end for the Climbing Micro-Beta Analyzer. A climber uploads a video of a fall and gets 1–3
body-position cues with an overlay (skeleton, center of gravity, base of support, reach to the target hold).

Vite + React + TypeScript, Supabase (auth, database, storage, realtime), `tus-js-client` for resumable upload,
HashRouter (GitHub Pages has no server rewrites). The backend lives in a separate private repo. The API, tables,
storage paths, `result.json` and `features.json` are defined in the backend's `CONTRACT.md` (v1).

## Run locally

```bash
npm ci
cp .env.example .env.local   # fill in the three values
npm run dev
```

Open `http://localhost:5173/#/demo` (or `/?demo=1`) to see the result view on the built-in fixture. It needs no backend.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Typecheck (`tsc -b`) and build to `dist/` |
| `npm run typecheck` | Typecheck only |
| `npm run lint` | ESLint |
| `npm run fixtures` | Regenerate `public/demo/` (synthetic 3 s clip + JSON). Needs `ffmpeg`. |

## Environment

| Variable | Notes |
|---|---|
| `VITE_SUPABASE_URL` | Public |
| `VITE_SUPABASE_ANON_KEY` | Public anon key only. Never put the service-role key here. |
| `VITE_API_URL` | Modal web endpoint, no trailing slash |
| `VITE_BASE` | Sub-path. CI sets `/<repo-name>/`. Leave unset locally. |

## Deploy (GitHub Pages)

1. Repo → Settings → Pages → Source: **GitHub Actions**.
2. Repo → Settings → Secrets and variables → Actions → **Variables**: add `VITE_SUPABASE_URL`,
   `VITE_SUPABASE_ANON_KEY`, `VITE_API_URL`.
3. Push to `main`. `.github/workflows/deploy.yml` lints, builds and deploys.
4. Supabase → Authentication → URL configuration: add the site URL
   (`https://<user>.github.io/microbeta-web/`) to **Redirect URLs**. Sign-in uses PKCE, so the code comes back as
   `?code=` and does not clash with the `#/` routes.

## Routes

| Route | Page |
|---|---|
| `#/` | Landing + waitlist |
| `#/login` | Google sign-in |
| `#/waitlisted` | Signed in but not invited |
| `#/guide` | Filming guide (shown before the first upload) |
| `#/upload` | Pick/record, checks, wall angle, upload, start |
| `#/jobs`, `#/jobs/:id` | Jobs list and status/result (live via Realtime) |
| `#/s/:token` | Public read-only share page |
| `#/demo` (`?empty=1`) | Fixture result view |
