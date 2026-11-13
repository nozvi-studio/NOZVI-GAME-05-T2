# Deploy — Vercel (web) + Render (server)

Owner decision 2026-11-13 (see DECISIONS): the web client goes to Vercel, the Colyseus server to Render Free. Vercel cannot host the server because its functions do not keep WebSocket connections open.

Order: deploy the server first, then the web client (it needs the server URL at build time), then put the web URL back into the server's `ALLOWED_ORIGINS`.

## 1. Server on Render

1. render.com → **New → Blueprint** → connect GitHub → pick `nozvi-studio/NOZVI-GAME-05-T2` and the branch to deploy. Render reads `render.yaml` at the repo root.
2. When asked for `ALLOWED_ORIGINS`, leave it empty for now (any origin is allowed while it is empty).
3. Apply. The first build takes a few minutes. Check `https://<service>.onrender.com/health` returns `{"status":"ok"}`.

Free-tier behaviour: the service sleeps after 15 minutes without traffic and needs about a minute to wake; a restart or redeploy clears every room (state is in memory only).

## 2. Web client on Vercel

1. vercel.com → **Add New → Project** → import `nozvi-studio/NOZVI-GAME-05-T2`.
2. Keep **Root Directory** at the repository root; `vercel.json` sets install, build and output (`apps/web/dist`).
3. **Environment Variables**: `VITE_SERVER_URL` = `https://<service>.onrender.com` (no trailing slash). It is baked into the browser bundle at build time, so change it → redeploy.
4. Pick the production branch in Project → Settings → Git, then deploy.

## 3. Lock the server to the web origin

Render → service → Environment → set `ALLOWED_ORIGINS` = `https://<project>.vercel.app` (add custom domains comma-separated) → save (Render redeploys).

## Check

Open the Vercel URL in two browsers, join with the same office code, and confirm each sees the other. If the join screen says "server unreachable", the Render service may still be waking up; retry after a minute.

## Notes

- No secrets are needed; never commit tokens. `VITE_*` values are public.
- Join rate limit is per socket address; behind Render's proxy all clients may share one address until Phase 5 adds proxy-header handling (plan §6 item 5). If friends get `rate_limited`, raise `JOIN_LIMIT_PER_MINUTE` on Render temporarily.
