CREATE TABLE telegram_sessions (
  id BIGSERIAL PRIMARY KEY,
  telegram_chat_id BIGINT UNIQUE NOT NULL,
  session_id TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  last_message TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_telegram_chat_id ON telegram_sessions(telegram_chat_id);
