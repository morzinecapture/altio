-- Fix: re-apply 'cancelled' to emergency_bids CHECK constraint
-- (previous migration 20260328000001 was marked applied but never ran)
ALTER TABLE emergency_bids DROP CONSTRAINT IF EXISTS emergency_bids_status_check;
ALTER TABLE emergency_bids DROP CONSTRAINT IF EXISTS emergency_bids_status__check;
ALTER TABLE emergency_bids ADD CONSTRAINT emergency_bids_status_check
  CHECK (status IN ('pending', 'accepted', 'rejected', 'cancelled'));
