# Deploy — Vercel (web) + Render (server)

Owner decision 2026-11-13 (see DECISIONS): the web client goes to Vercel, the Colyseus server to Render Free. Vercel cannot host the server because its functions do not keep WebSocket connections open.

Order: deploy the server first, then the web client (it needs the server URL at build time), then put the web URL back into the server's `ALLOWED_ORIGINS`.

## CI/CD (GitHub Actions)

- `.github/workflows/ci.yml`: `pnpm check` on every push and PR; Playwright e2e (one retry, report uploaded on failure) on PRs and on `main`.
- `.github/workflows/deploy.yml`: on every push to **`dev`** it runs the full CI (check + e2e) and, if it passes, deploys that commit to Render (deploy hook), waits for `/health`, then builds and deploys the web client to Vercel (production) with the Vercel CLI. **Actions → deploy → Run workflow** redeploys by hand (the button appears once `deploy.yml` is on the default branch).
- Render's service must track the `dev` branch (Render → service → Settings → Build & Deploy → Branch).
- Render auto-deploy is off (`render.yaml`) and Vercel's Git auto-deploy is off (`vercel.json`), so only the workflow deploys production.

One-time setup after steps 1 to 3 below, in GitHub → repo **Settings → Secrets and variables → Actions** (or the `production` environment):

| Name                     | Kind     | Value                                                                                              |
| ------------------------ | -------- | -------------------------------------------------------------------------------------------------- |
| `RENDER_DEPLOY_HOOK_URL` | secret   | Render → service → Settings → Deploy Hook                                                          |
| `VERCEL_TOKEN`           | secret   | vercel.com → Account Settings → Tokens                                                             |
| `VERCEL_ORG_ID`          | secret   | Vercel project → Settings → General (Team/Owner ID), or `.vercel/project.json` after `vercel link` |
| `VERCEL_PROJECT_ID`      | secret   | Vercel project → Settings → General → Project ID                                                   |
| `SERVER_URL`             | variable | `https://<service>.onrender.com` (used for the health check)                                       |

Missing values make the deploy job fail with a message naming the missing one; CI itself does not need them.

## 1. Server on Render

1. render.com → **New → Blueprint** → connect GitHub → pick `nozvi-studio/NOZVI-GAME-05-T2` and the **`dev`** branch. Render reads `render.yaml` at the repo root.
2. When asked for `ALLOWED_ORIGINS`, leave it empty for now (any origin is allowed while it is empty).
3. Apply. The first build takes a few minutes. Check `https://<service>.onrender.com/health` returns `{"status":"ok"}`.

Free-tier behaviour: the service sleeps after 15 minutes without traffic and needs about a minute to wake; a restart or redeploy clears every room (state is in memory only).

## 2. Web client on Vercel

1. vercel.com → **Add New → Project** → import `nozvi-studio/NOZVI-GAME-05-T2`.
2. Keep **Root Directory** at the repository root; `vercel.json` sets install, build and output (`apps/web/dist`).
3. **Environment Variables**: `VITE_SERVER_URL` = `https://<service>.onrender.com` (no trailing slash). It is baked into the browser bundle at build time, so change it → redeploy.
4. Run a first deploy from the dashboard (or the deploy workflow once the secrets exist). Later deploys come from GitHub Actions.

## 3. Lock the server to the web origin

Render → service → Environment → set `ALLOWED_ORIGINS` = `https://<project>.vercel.app` (add custom domains comma-separated) → save (Render redeploys).

## Check

Open the Vercel URL in two browsers, join with the same office code, and confirm each sees the other. If the join screen says "server unreachable", the Render service may still be waking up; retry after a minute.

## Notes

- No secrets are needed; never commit tokens. `VITE_*` values are public.
- Join rate limit is per socket address; behind Render's proxy all clients may share one address until Phase 5 adds proxy-header handling (plan §6 item 5). If friends get `rate_limited`, raise `JOIN_LIMIT_PER_MINUTE` on Render temporarily.
