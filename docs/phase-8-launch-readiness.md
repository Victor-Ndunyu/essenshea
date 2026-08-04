# Phase 8 launch-readiness report

## Production story

A customer discovers a product, adds it to a request list, submits a validated order, and receives a reference. The backend persists the order before notification, records only approved aggregate analytics, and the owner reads seven-day signals through `/insights`.

## Automated release gate

Run before every production merge:

```bash
npm test
npx tsc --noEmit --allowImportingTsExtensions
npm run build
npm run test:e2e:local
```

The local API test writes a clearly labelled test order and deletes it afterward. Run it only with a non-production notification configuration.

## Required production checks

1. Apply every Supabase migration through `202608040001_phase_eight_production_readiness.sql`.
2. Confirm `GET /api/health` returns HTTP 200 and `{"status":"ready"}`.
3. Submit one real storefront request and confirm the reference appears in Supabase and the owner receives a notification.
4. Open the customer assistant twice in one browser session and verify it follows the previous message.
5. Send `/insights` to the owner bot and confirm the current and previous seven-day periods are labelled correctly.
6. Verify `/catalog` redirects to `/shop`, `/robots.txt` and `/sitemap.xml` return 200, and the private owner desk is not indexed.
7. Review Vercel runtime errors after deployment. Any database-schema error or HTTP 500 is a launch blocker.

## Environment checklist

- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
- At least one configured AI provider credential
- Telegram bot token, webhook secret, setup secret, and owner chat ID
- At least one working order-notification channel
- `ECO_REWARDS_HASH_SECRET` and `ECO_REWARDS_ADMIN_KEY`
- `NEXT_PUBLIC_SITE_URL=https://essenshea.vercel.app`

Never expose service-role, Telegram, Eco-Rewards admin, WhatsApp, or Resend secrets in browser code.

## Recovery

- If a release fails before production: keep the prior production deployment promoted.
- If production fails: use Vercel's rollback candidate for the previous known-good `master` deployment.
- If `/api/health` is degraded: inspect its failed table check, apply the missing migration, then re-run health before testing customer flows.
- Orders are persisted before notifications. A notification failure must be recovered from the `orders` table using the customer reference.

## Honest readiness status

The codebase is ready to deploy once the Phase 8 migration is applied. Production is not launch-ready while `/api/health` is degraded, while runtime logs show schema-cache errors, or until one complete real order and owner-notification flow passes.
