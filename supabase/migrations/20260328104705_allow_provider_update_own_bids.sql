-- Allow providers to update (cancel) their own pending bids
DROP POLICY IF EXISTS "Providers update own bids" ON emergency_bids;
CREATE POLICY "Providers update own bids" ON emergency_bids
  FOR UPDATE TO authenticated
  USING (auth.uid() = provider_id AND status = 'pending')
  WITH CHECK (auth.uid() = provider_id AND status IN ('pending', 'cancelled'));
