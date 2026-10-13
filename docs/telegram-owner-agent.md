# Essenshea Telegram Owner Desk

The Telegram bot is a private owner operations assistant. Customer conversations belong on the public website; an unauthorized Telegram chat receives no catalogue, order, analytics, memory, or mutation access.

## Required production configuration

Set these server-only variables in the deployment environment:

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET`
- `TELEGRAM_SETUP_SECRET`
- `TELEGRAM_WEBHOOK_URL` — production value: `https://essenshea.vercel.app/api/telegram/webhook`
- `OWNER_TELEGRAM_CHAT_IDS` — comma-separated positive Telegram IDs
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- At least one configured AI provider key

`OWNER_TELEGRAM_CHAT_ID` remains supported for backward compatibility. `OWNER_LOW_STOCK_THRESHOLD` is optional and defaults to `3`.

An owner session is authorized only when all three conditions are true:

1. The webhook secret is valid.
2. The message comes from a private Telegram chat.
3. The sender ID equals the chat ID and appears in the configured owner allowlist.

## Finding the current owner's Telegram ID

Send `/id` or `/whoami` to the bot in a private chat. The bot returns the sender's own numeric Telegram ID without granting access to any owner data. Never guess the ID. Store only the numeric ID in the environment variable, without `@` or a username.

During initial setup, keep the temporary operator and final owner as separate allowlist entries. Verify the incoming owner before removing the temporary operator. Never replace the only working owner ID before the incoming owner has passed the command checks below.

## Safe website changes

Every supported mutation follows this sequence:

1. The owner sends a slash command or a supported natural-language request.
2. The bot resolves one exact product and shows the current and proposed values.
3. The bot stores a pending audit event and returns a random eight-character token.
4. The owner sends `/confirm TOKEN` within ten minutes or `/cancel TOKEN`.
5. The token is claimed once, the change is applied, the live record is read back, and the audit event is completed.

Expired, cancelled, reused and ambiguous requests make no change.

## Owner handover

1. Add the incoming owner's Telegram ID beside the current owner's ID in `OWNER_TELEGRAM_CHAT_IDS`.
2. Redeploy and verify `/dashboard`, `/lowstock`, `/orders`, and `/help` from the incoming owner's private chat.
3. Preview and confirm one harmless reversible change, then verify `/activity` records it.
4. Remove the former owner's ID and redeploy.
5. Confirm the former owner receives the private-access denial.
6. Rotate Telegram setup/webhook secrets if administrative control also changed.

No code change is required for the handover.


## Approval and outage recovery

Supported natural-language edits (including "I want to change PRODUCT from CATEGORY to CATEGORY") create a saved preview. The destination must be an existing catalogue category. Replying "Proceed", "Go ahead", or "I would like to proceed" approves only when exactly one unexpired preview is pending for that owner. With multiple previews, select the specific Approve button or use its token. Repeated approvals never replay a used action, and already-saved product values do not create a new action.

The conversational model cannot prepare or apply changes; unsupported mutation wording receives command guidance. Review commands access the same database directly rather than calling the site's API over HTTP. Read requests can retry once, but writes are never automatically repeated. If a product write response is lost, the agent reads the live result before reporting success. An uncertain outcome directs the owner to `/activity` and `/describe` or `/reviews` before retrying. Telegram callback acknowledgements and button setup checks cannot block authenticated typed commands. Historical failed tokens must not be reused; resend the full request for a fresh preview.
