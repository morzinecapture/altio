-- Company form is not a VAT regime. Preserve existing tax declarations;
-- historical values inferred by earlier migrations require separate confirmation.
BEGIN;
CREATE OR REPLACE FUNCTION public.sync_auto_entrepreneur_vat()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.users
  SET is_auto_entrepreneur = (NEW.company_type = 'auto_entrepreneur')
  WHERE id = NEW.provider_id;
  RETURN NEW;
END;
$$;
COMMIT;
