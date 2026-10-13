-- Run against a project with a registered provider. No push is sent: pg_net
-- processes requests only after commit, and this entire test is rolled back.
BEGIN;
DO $$
DECLARE
  recipient uuid;
  reference uuid := gen_random_uuid();
  request_id bigint;
  payload jsonb;
BEGIN
  SELECT id INTO STRICT recipient FROM public.users
  WHERE role = 'provider' AND nullif(expo_push_token, '') IS NOT NULL LIMIT 1;
  PERFORM public._send_push(recipient, 'TEST ROLLBACK candidature', 'Test sans envoi', reference, 'emergency');
  SELECT max(id) INTO request_id FROM net.http_request_queue
  WHERE url = 'https://exp.host/--/api/v2/push/send'
    AND convert_from(body, 'UTF8')::jsonb->>'title' = 'TEST ROLLBACK candidature';
  IF request_id IS NULL THEN RAISE EXCEPTION 'Push not queued'; END IF;
  SELECT convert_from(body, 'UTF8')::jsonb INTO payload FROM net.http_request_queue WHERE id = request_id;
  IF payload->'data'->>'emergencyId' IS DISTINCT FROM reference::text
    OR payload->>'sound' IS DISTINCT FROM 'default'
  THEN RAISE EXCEPTION 'Incorrect emergency payload'; END IF;
  PERFORM public._send_push(recipient, 'TEST ROLLBACK candidature', 'Test sans envoi', reference, 'emergency');
  IF (SELECT count(*) FROM net.http_request_queue
      WHERE convert_from(body, 'UTF8')::jsonb->>'title' = 'TEST ROLLBACK candidature') <> 1
  THEN RAISE EXCEPTION 'Duplicate push'; END IF;
  PERFORM public._send_push(recipient, 'TEST ROLLBACK mission', 'Test sans envoi', reference, 'mission');
  IF NOT EXISTS (SELECT 1 FROM net.http_request_queue
      WHERE convert_from(body, 'UTF8')::jsonb->>'title' = 'TEST ROLLBACK mission'
      AND convert_from(body, 'UTF8')::jsonb->'data'->>'missionId' = reference::text)
  THEN RAISE EXCEPTION 'Incorrect mission payload'; END IF;
  IF has_function_privilege('authenticated', 'public._send_push(uuid,text,text,uuid,text)', 'EXECUTE')
    OR has_function_privilege('anon', 'public._send_push(uuid,text,text,uuid,text)', 'EXECUTE')
  THEN RAISE EXCEPTION 'Untrusted callers can send arbitrary pushes'; END IF;
END $$;
ROLLBACK;
SELECT 'dispatch, routes, deduplication and permissions passed; all test writes rolled back' AS result;
