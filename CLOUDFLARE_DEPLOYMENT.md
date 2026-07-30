# Cloudflare Deployment

PLMS POC is deployed as a Cloudflare Worker with Static Assets. The Worker
executes before every HTML, JavaScript, JSON, PDF worker, and other static
asset request so the complete application bundle remains behind HTTP Basic
Authentication.

## Production target

- Worker: `plms-poc-protected`
- URL: `https://plms-poc-protected.hafizna-arsyil.workers.dev`
- Username: `plms`
- Password: stored only as the encrypted Cloudflare secret
  `PLMS_AUTH_PASSWORD`; it is intentionally not committed to this repository.

## Deploy

```bash
npm run cloudflare:deploy
```

This runs the production Vite build and deploys `dist/` using
`wrangler.jsonc`.

Rotate the access password:

```bash
npx wrangler secret put PLMS_AUTH_PASSWORD
```

Cloudflare preserves encrypted secrets across normal `wrangler deploy`
operations.

## Local protected preview

Set `PLMS_AUTH_PASSWORD` in `.dev.vars` (ignored by Git), then run:

```bash
npm run cloudflare:dev
```

## Security model and limitations

- The Worker returns `401` before accessing any static asset when credentials
  are missing or invalid.
- If the production secret is missing, the deployment fails closed with
  `503`.
- Responses include `noindex`, `DENY` framing, `nosniff`, and
  `no-referrer` headers.
- HTTP Basic Authentication is suitable for a small HTTPS-protected POC.
  Migrate to Cloudflare Access with organization identity policies before
  broader internal rollout.
- The hosted application still uses browser `localStorage`. Each browser has
  its own working state; this deployment does not add shared persistence,
  server-side audit storage, or multi-user approval.
