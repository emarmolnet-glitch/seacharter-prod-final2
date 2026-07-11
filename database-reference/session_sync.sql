CREATE TABLE IF NOT EXISTS session_sync (
  user_id UUID PRIMARY KEY,
  last_sync_data JSONB NOT NULL CHECK (jsonb_typeof(last_sync_data) = 'array'),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
