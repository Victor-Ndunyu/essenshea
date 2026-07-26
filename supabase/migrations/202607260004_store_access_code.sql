ALTER TABLE eco_reward_accounts ADD COLUMN IF NOT EXISTS access_code text;

-- Backfill access_code from the creation event logs where possible
-- (new accounts will store it directly going forward)
