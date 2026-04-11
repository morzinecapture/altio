-- ============================================================================
-- Disable automatic cleaning mission creation from iCal reservations.
-- The owner should be notified of new reservations and choose whether to
-- create cleaning missions (via the app), instead of having them auto-created.
-- ============================================================================

DROP TRIGGER IF EXISTS trg_auto_cleaning_mission ON reservations;
DROP FUNCTION IF EXISTS auto_create_cleaning_mission_from_reservation();
