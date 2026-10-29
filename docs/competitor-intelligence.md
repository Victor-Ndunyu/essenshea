# Competitor observations

The owner desk supports `/competitors`, `/competitors refresh`, `/competitors on`, `/competitors off`, and `/competitors snooze` (30 days). Natural competitor questions use the same grounded report.

Production scans run Mondays at 05:00 UTC (08:00 Nairobi) via `/api/cron/competitors`. Vercel supplies the server-only `CRON_SECRET` bearer token. No token is embedded in source. Failed scans are recorded, not interpreted as removals; cron does not automatically retry. On-demand reports refresh observations older than 24 hours, subject to a shared atomic 15-minute scan cooldown.

Sources are fixed official Ythera and Cinnabar Green domains. Robots directives, same-origin redirects, response size limits, and request timeouts apply. Up to 100 products and 20 variants per product are sampled. Prices require verified currency. Comparisons require the same variant, size and currency. Newly observed listings are not presented as confirmed launches. No private sales, competitor performance, social posts, ads or market-wide coverage is inferred. Snapshots expire after 180 days on the next scan.

Suggestions use fresh observations, the verified Essenshea catalogue and aggregate customer topics. They are experiments for the owner to consider, not automatically executed changes. Models cannot fetch arbitrary URLs or execute commands through this path. If models fail, the report retains evidence and a deterministic catalogue-improvement suggestion.

Nudges are appended only to suitable authorized owner replies: after 14 days without reviewing competitors and no more than once every 14 days. They require a successful observation within eight days. New owners get a 14-day grace period. Muting and snoozing are persisted. No standalone Telegram message is sent. Orders, complaints, approvals, editing and photos suppress reminders.

Validation: 117 automated tests passed; production build passed. Database transaction checks (rolled back) verified first-use grace, due reminder, duplicate suppression, mute, snooze, recent-review reset, scan cooldown, and denied anonymous/client access. Source tests cover robots, redirects, bounds, malformed prices/currency, stale evidence, failed scans and baseline comparisons. Existing owner transcript and approval regression tests remain passing.
