-- App-wide audit trail for edit operations: who changed what, when, and
-- through which surface (the app itself, the assistant, or the admin panel).
-- Actor and target are snapshotted as text because the rows they point at
-- can be deleted; the log has to outlive both sides.
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_label TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'app',
  household_id UUID REFERENCES households(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  target_label TEXT NOT NULL,
  detail TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_log_created ON audit_log(created_at DESC);
CREATE INDEX idx_audit_log_household ON audit_log(household_id, created_at DESC);
