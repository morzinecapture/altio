-- Review responses: allow providers to respond to reviews
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'reviews' AND column_name = 'provider_response') THEN
    ALTER TABLE public.reviews ADD COLUMN provider_response TEXT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'reviews' AND column_name = 'provider_response_at') THEN
    ALTER TABLE public.reviews ADD COLUMN provider_response_at TIMESTAMPTZ;
  END IF;
END $$;

-- Provider-to-owner ratings
CREATE TABLE IF NOT EXISTS public.provider_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id UUID NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  provider_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(mission_id, provider_id)
);

-- RLS for provider_reviews
ALTER TABLE public.provider_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Providers can create reviews for owners" ON public.provider_reviews;
CREATE POLICY "Providers can create reviews for owners" ON public.provider_reviews
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = provider_id);

DROP POLICY IF EXISTS "Providers can read own reviews" ON public.provider_reviews;
CREATE POLICY "Providers can read own reviews" ON public.provider_reviews
  FOR SELECT TO authenticated
  USING (auth.uid() = provider_id OR auth.uid() = owner_id);

-- RLS: providers can respond to reviews about them
DROP POLICY IF EXISTS "Providers can respond to reviews" ON public.reviews;
CREATE POLICY "Providers can respond to reviews" ON public.reviews
  FOR UPDATE TO authenticated
  USING (auth.uid() = provider_id)
  WITH CHECK (auth.uid() = provider_id);
