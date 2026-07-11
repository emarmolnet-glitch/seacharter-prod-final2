CREATE TABLE IF NOT EXISTS session_sync (
  user_id TEXT PRIMARY KEY,
  last_sync_data JSONB NOT NULL CHECK (jsonb_typeof(last_sync_data) = 'object'),
  last_action_module TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
