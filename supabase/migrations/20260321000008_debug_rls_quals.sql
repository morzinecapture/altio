-- Debug: check the actual USING clauses of policies
DROP FUNCTION IF EXISTS debug_rls_quals();
CREATE OR REPLACE FUNCTION debug_rls_quals()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result json;
BEGIN
  SELECT json_agg(t)
  INTO result
  FROM (
    SELECT tablename AS tbl, policyname AS name, cmd, roles, qual, with_check
    FROM pg_policies
    WHERE tablename IN ('emergency_bids', 'emergency_requests')
    ORDER BY tablename, policyname
  ) t;

  RETURN result;
END;
$$;
