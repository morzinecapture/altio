-- Expose nextval as an RPC function for edge functions
CREATE OR REPLACE FUNCTION nextval(seq text)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN nextval(seq::regclass);
END;
$$;

-- Grant execute to authenticated and service_role
GRANT EXECUTE ON FUNCTION nextval(text) TO authenticated;
GRANT EXECUTE ON FUNCTION nextval(text) TO service_role;
