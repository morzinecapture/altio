-- Temporary debug function to check RLS policies
-- Can be called via supabase.rpc('debug_rls_check')
CREATE OR REPLACE FUNCTION debug_rls_check()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result json;
BEGIN
  SELECT json_build_object(
    'emergency_bids_rls', (
      SELECT row_to_json(t) FROM (
        SELECT relrowsecurity, relforcerowsecurity
        FROM pg_class WHERE relname = 'emergency_bids'
      ) t
    ),
    'emergency_bids_policies', (
      SELECT json_agg(json_build_object(
        'name', policyname,
        'cmd', cmd,
        'roles', roles,
        'permissive', permissive
      ))
      FROM pg_policies WHERE tablename = 'emergency_bids'
    ),
    'emergency_requests_policies', (
      SELECT json_agg(json_build_object(
        'name', policyname,
        'cmd', cmd,
        'roles', roles
      ))
      FROM pg_policies WHERE tablename = 'emergency_requests'
    ),
    'users_policies', (
      SELECT json_agg(json_build_object(
        'name', policyname,
        'cmd', cmd,
        'roles', roles
      ))
      FROM pg_policies WHERE tablename = 'users'
    ),
    'mission_quotes_policies', (
      SELECT json_agg(json_build_object(
        'name', policyname,
        'cmd', cmd
      ))
      FROM pg_policies WHERE tablename = 'mission_quotes'
    )
  ) INTO result;
  RETURN result;
END;
$$;
