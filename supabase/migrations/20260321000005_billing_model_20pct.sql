-- Modèle de facturation 10%+10% (20% total)
-- Ref: altio_facturation_synthese.docx — Mars 2026

-- ── 1. Ajouter le type 'service_fee' aux factures ───────────────────────────
-- (Facture 2 : Altio → propriétaire, frais de mise en relation 10%)
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_invoice_type_check;
ALTER TABLE invoices ADD CONSTRAINT invoices_invoice_type_check
  CHECK (invoice_type IN ('commission', 'service', 'service_fee'));

-- ── 2. Colonne payment_intent_id sur les missions ───────────────────────────
-- Permet de lier le paiement Stripe à la mission pour capturer + facturer
ALTER TABLE missions ADD COLUMN IF NOT EXISTS payment_intent_id TEXT;

-- Même colonne sur emergency_requests (pour le devis, quote_payment_id existe déjà)
-- On ajoute un index pour retrouver rapidement par PI
CREATE INDEX IF NOT EXISTS missions_payment_intent_id_idx ON missions(payment_intent_id)
  WHERE payment_intent_id IS NOT NULL;

-- ── 3. Bucket storage pour les factures HTML/XML ─────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('invoices', 'invoices', true)
ON CONFLICT (id) DO NOTHING;

-- Les factures sont lisibles publiquement (lien dans l'app)
CREATE POLICY "Invoices are publicly readable"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'invoices');

-- Seul le service_role (Edge Functions) peut écrire
CREATE POLICY "Service role can write invoices"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'invoices'
  AND auth.role() = 'service_role'
);

CREATE POLICY "Service role can update invoices"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'invoices'
  AND auth.role() = 'service_role'
);
