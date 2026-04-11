-- Migration: quote_line_items table + provider_profiles & mission_quotes extra columns
-- Date: 2026-03-24

-- ═══════════════════════════════════════════════════════════════════
-- 1. Create quote_line_items table
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS quote_line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES mission_quotes(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('labour', 'parts', 'displacement', 'diagnostic', 'other')),
  description TEXT NOT NULL,
  quantity NUMERIC(10,2) DEFAULT 1,
  unit TEXT DEFAULT 'unité',
  unit_price_ht NUMERIC(10,2) NOT NULL,
  total_ht NUMERIC(10,2) GENERATED ALWAYS AS (quantity * unit_price_ht) STORED,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════════════
-- 2. Enable RLS on quote_line_items + policies
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE quote_line_items ENABLE ROW LEVEL SECURITY;

-- Provider can INSERT their own quote lines
DROP POLICY IF EXISTS "Providers insert own quote lines" ON quote_line_items;
CREATE POLICY "Providers insert own quote lines" ON quote_line_items
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM mission_quotes mq
      WHERE mq.id = quote_line_items.quote_id
        AND mq.provider_id = auth.uid()
    )
  );

-- Provider and owner can SELECT lines for their quotes
DROP POLICY IF EXISTS "Participants read quote lines" ON quote_line_items;
CREATE POLICY "Participants read quote lines" ON quote_line_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM mission_quotes mq
      WHERE mq.id = quote_line_items.quote_id
        AND (
          mq.provider_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM emergency_requests er
            WHERE er.id = mq.emergency_request_id
              AND er.owner_id = auth.uid()
          )
          OR EXISTS (
            SELECT 1 FROM missions m
            WHERE m.id = mq.mission_id
              AND m.owner_id = auth.uid()
          )
        )
    )
  );

-- Provider can UPDATE their own quote lines
DROP POLICY IF EXISTS "Providers update own quote lines" ON quote_line_items;
CREATE POLICY "Providers update own quote lines" ON quote_line_items
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM mission_quotes mq
      WHERE mq.id = quote_line_items.quote_id
        AND mq.provider_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM mission_quotes mq
      WHERE mq.id = quote_line_items.quote_id
        AND mq.provider_id = auth.uid()
    )
  );

-- Provider can DELETE their own quote lines
DROP POLICY IF EXISTS "Providers delete own quote lines" ON quote_line_items;
CREATE POLICY "Providers delete own quote lines" ON quote_line_items
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM mission_quotes mq
      WHERE mq.id = quote_line_items.quote_id
        AND mq.provider_id = auth.uid()
    )
  );

-- Admins can do everything
DROP POLICY IF EXISTS "Admins manage quote line items" ON quote_line_items;
CREATE POLICY "Admins manage quote line items" ON quote_line_items
  FOR ALL TO authenticated
  USING (is_admin());

-- ═══════════════════════════════════════════════════════════════════
-- 3. Add columns to provider_profiles (idempotent)
-- ═══════════════════════════════════════════════════════════════════

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'provider_profiles' AND column_name = 'legal_status'
  ) THEN
    ALTER TABLE provider_profiles ADD COLUMN legal_status TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'provider_profiles' AND column_name = 'rcs_number'
  ) THEN
    ALTER TABLE provider_profiles ADD COLUMN rcs_number TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'provider_profiles' AND column_name = 'rne_number'
  ) THEN
    ALTER TABLE provider_profiles ADD COLUMN rne_number TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'provider_profiles' AND column_name = 'insurance_company'
  ) THEN
    ALTER TABLE provider_profiles ADD COLUMN insurance_company TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'provider_profiles' AND column_name = 'insurance_coverage_area'
  ) THEN
    ALTER TABLE provider_profiles ADD COLUMN insurance_coverage_area TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'provider_profiles' AND column_name = 'qualifications'
  ) THEN
    ALTER TABLE provider_profiles ADD COLUMN qualifications JSONB DEFAULT '[]'::jsonb;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'provider_profiles' AND column_name = 'hourly_rate'
  ) THEN
    ALTER TABLE provider_profiles ADD COLUMN hourly_rate NUMERIC(10,2);
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- 4. Add columns to mission_quotes (idempotent)
-- ═══════════════════════════════════════════════════════════════════

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'mission_quotes' AND column_name = 'labour_cost'
  ) THEN
    ALTER TABLE mission_quotes ADD COLUMN labour_cost NUMERIC(10,2);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'mission_quotes' AND column_name = 'parts_cost'
  ) THEN
    ALTER TABLE mission_quotes ADD COLUMN parts_cost NUMERIC(10,2);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'mission_quotes' AND column_name = 'validity_days'
  ) THEN
    ALTER TABLE mission_quotes ADD COLUMN validity_days INT DEFAULT 30;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'mission_quotes' AND column_name = 'estimated_start_date'
  ) THEN
    ALTER TABLE mission_quotes ADD COLUMN estimated_start_date TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'mission_quotes' AND column_name = 'estimated_duration'
  ) THEN
    ALTER TABLE mission_quotes ADD COLUMN estimated_duration TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'mission_quotes' AND column_name = 'quote_number'
  ) THEN
    ALTER TABLE mission_quotes ADD COLUMN quote_number TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'mission_quotes' AND column_name = 'quote_document_url'
  ) THEN
    ALTER TABLE mission_quotes ADD COLUMN quote_document_url TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'mission_quotes' AND column_name = 'description'
  ) THEN
    ALTER TABLE mission_quotes ADD COLUMN description TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'mission_quotes' AND column_name = 'is_renovation'
  ) THEN
    ALTER TABLE mission_quotes ADD COLUMN is_renovation BOOLEAN DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'mission_quotes' AND column_name = 'owner_signature_at'
  ) THEN
    ALTER TABLE mission_quotes ADD COLUMN owner_signature_at TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'mission_quotes' AND column_name = 'owner_signature_ip'
  ) THEN
    ALTER TABLE mission_quotes ADD COLUMN owner_signature_ip TEXT;
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- 5. Create quote sequence for generate-quote edge function
-- ═══════════════════════════════════════════════════════════════════

CREATE SEQUENCE IF NOT EXISTS quote_seq START 1;
GRANT USAGE, SELECT ON SEQUENCE quote_seq TO service_role;
GRANT USAGE, SELECT ON SEQUENCE quote_seq TO authenticated;

-- ═══════════════════════════════════════════════════════════════════
-- 6. Add total_ht column to mission_quotes (needed by submitQuoteWithLines)
-- ═══════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'mission_quotes'
      AND column_name = 'total_ht'
  ) THEN
    ALTER TABLE mission_quotes ADD COLUMN total_ht NUMERIC(10,2);
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- 7. Extend mission_quotes RLS to support regular missions
--    (existing policies only checked emergency_requests)
-- ═══════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'mission_quotes') THEN
    DROP POLICY IF EXISTS "Providers insert own quotes" ON mission_quotes;
    CREATE POLICY "Providers insert own quotes" ON mission_quotes
      FOR INSERT TO authenticated
      WITH CHECK (
        provider_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM emergency_requests er
          WHERE er.id = mission_quotes.emergency_request_id
            AND er.accepted_provider_id = auth.uid()
        )
        OR EXISTS (
          SELECT 1 FROM missions m
          WHERE m.id = mission_quotes.mission_id
            AND m.assigned_provider_id = auth.uid()
        )
      );

    DROP POLICY IF EXISTS "Participants read quotes" ON mission_quotes;
    CREATE POLICY "Participants read quotes" ON mission_quotes
      FOR SELECT TO authenticated
      USING (
        provider_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM emergency_requests er
          WHERE er.id = mission_quotes.emergency_request_id
            AND (er.owner_id = auth.uid() OR er.accepted_provider_id = auth.uid())
        )
        OR EXISTS (
          SELECT 1 FROM missions m
          WHERE m.id = mission_quotes.mission_id
            AND (m.owner_id = auth.uid() OR m.assigned_provider_id = auth.uid())
        )
      );

    DROP POLICY IF EXISTS "Owners update quotes" ON mission_quotes;
    CREATE POLICY "Owners update quotes" ON mission_quotes
      FOR UPDATE TO authenticated
      USING (
        provider_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM emergency_requests er
          WHERE er.id = mission_quotes.emergency_request_id
            AND er.owner_id = auth.uid()
        )
        OR EXISTS (
          SELECT 1 FROM missions m
          WHERE m.id = mission_quotes.mission_id
            AND m.owner_id = auth.uid()
        )
      );
  END IF;
END $$;
