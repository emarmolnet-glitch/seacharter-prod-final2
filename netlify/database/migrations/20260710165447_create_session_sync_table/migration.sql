CREATE TABLE IF NOT EXISTS session_sync (
  user_id UUID PRIMARY KEY,
  last_sync_data JSONB NOT NULL,
  last_action_module TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
