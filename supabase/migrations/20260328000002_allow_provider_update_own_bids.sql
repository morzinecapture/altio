-- Allow providers to update (cancel) their own pending bids
CREATE POLICY "Providers update own bids" ON emergency_bids
  FOR UPDATE USING (provider_id = auth.uid())
  WITH CHECK (provider_id = auth.uid() AND status IN ('pending', 'cancelled'));
