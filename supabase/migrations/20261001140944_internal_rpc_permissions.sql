-- Definer functions must not inherit the default PUBLIC execute privilege.
do $$
declare f record;
begin
  for f in select p.oid::regprocedure signature, p.proname, p.prorettype
           from pg_proc p join pg_namespace n on n.oid=p.pronamespace
           where n.nspname='public' and p.prosecdef
  loop
    execute format('revoke execute on function %s from public, anon', f.signature);
    if f.proname = any(array['_send_push','_mark_provider_zone_notified',
      'debug_rls_check','debug_rls_quals','expire_pending_missions',
      'find_primary_favorite_provider','next_credit_note_number',
      'next_mandate_invoice_number','next_quote_number','nextval','process_favorites_timeouts']) then
      execute format('revoke execute on function %s from authenticated', f.signature);
      execute format('grant execute on function %s to service_role', f.signature);
    end if;
  end loop;
end $$;
