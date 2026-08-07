-- Retention was keyed on account age, so a long-standing user who left their
-- household became instantly eligible for deletion. Track how long an account
-- has actually been without a household instead. Maintained by trigger so
-- every path is covered, including memberships removed by cascade when a
-- household is deleted.
ALTER TABLE users ADD COLUMN householdless_since TIMESTAMPTZ DEFAULT now();

UPDATE users SET householdless_since = created_at;
UPDATE users u SET householdless_since = NULL
  WHERE EXISTS (
    SELECT 1 FROM household_members hm WHERE hm.user_id = u.id
  );

CREATE FUNCTION update_householdless_since() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE users SET householdless_since = NULL WHERE id = NEW.user_id;
    RETURN NEW;
  END IF;
  UPDATE users SET householdless_since = now()
    WHERE id = OLD.user_id AND NOT EXISTS (
      SELECT 1 FROM household_members hm WHERE hm.user_id = OLD.user_id
    );
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_householdless_since
  AFTER INSERT OR DELETE ON household_members
  FOR EACH ROW EXECUTE FUNCTION update_householdless_since();
