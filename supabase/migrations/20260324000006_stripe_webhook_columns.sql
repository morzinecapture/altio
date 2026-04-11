-- Add columns needed by stripe-webhook edge function

-- Track which Stripe PaymentIntent paid a mission
ALTER TABLE missions ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT;

-- Track Stripe Connect account status on provider profiles
ALTER TABLE provider_profiles ADD COLUMN IF NOT EXISTS stripe_charges_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE provider_profiles ADD COLUMN IF NOT EXISTS stripe_payouts_enabled BOOLEAN DEFAULT FALSE;
