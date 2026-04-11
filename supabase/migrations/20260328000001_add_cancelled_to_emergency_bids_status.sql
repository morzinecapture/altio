-- Fix: allow 'cancelled' status for emergency bids (provider can withdraw)
ALTER TABLE emergency_bids DROP CONSTRAINT IF EXISTS emergency_bids_status_check;
ALTER TABLE emergency_bids DROP CONSTRAINT IF EXISTS emergency_bids_status__check;
ALTER TABLE emergency_bids ADD CONSTRAINT emergency_bids_status_check
  CHECK (status IN ('pending', 'accepted', 'rejected', 'cancelled'));
