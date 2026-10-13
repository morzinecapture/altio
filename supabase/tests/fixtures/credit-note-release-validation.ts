// Temporary endpoint for the explicitly authorized release test. Removed from
// the hosted project after use. Never accepts a customer invoice identifier.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const runId = '7a19240c-384c-4ccf-b5be-48343c99d928';
Deno.serve(async req => {
  const key = Deno.env.get('COMPLETION_WORKER_KEY');
  if (req.method !== 'POST' || !key || req.headers.get('x-service-key') !== key) return new Response('Unauthorized', { status: 401 });
  if (!/^(sk|rk)_test_/.test(Deno.env.get('STRIPE_SECRET_KEY') || '')) return new Response('Test mode required', { status: 409 });
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const users: string[] = []; const cleanupErrors: string[] = []; let proof: Record<string, unknown> = {}; let failed = false; let stage = 'preflight';
  const check = (result: { error?: unknown }) => { if (result.error) throw new Error('Test operation failed'); };
  try {
    // Refuse to reuse any pre-existing fixture, even one with the same label.
    const existing = await db.from('invoices').select('id').eq('id', runId).maybeSingle(); check(existing);
    if (existing.data) return new Response('Fixture already exists; inspect before retry', { status: 409 });
    stage = 'create_test_users';
    for (const role of ['provider', 'owner']) {
      const email = `altio.release.${runId}.${role}@example.invalid`;
      const result = await db.auth.admin.createUser({ email, password: crypto.randomUUID() + crypto.randomUUID(), email_confirm: true,
        app_metadata: { release_validation: runId }, user_metadata: { name: 'TEST ALTIO — ' + role } });
      check(result); if (!result.data.user) throw new Error('Fixture user unavailable');
      users.push(result.data.user.id);
      check(await db.from('users').insert({ id: result.data.user.id, email, name: 'TEST ALTIO — ' + role, role,
        company_name: role === 'provider' ? 'ENTITÉ DE TEST — AUCUN CLIENT' : null, billing_address: 'ADRESSE FICTIVE — RECETTE', is_vat_exempt: true }));
    }
    stage = 'create_test_invoice';
    check(await db.from('invoices').insert({ id: runId, invoice_number: 'TEST-RELEASE-' + runId, invoice_type: 'service', amount_ht: 100, amount_ttc: 100,
      vat_rate: 0, seller_id: users[0], buyer_id: users[1], status: 'paid', stripe_pi_id: 'pi_TEST_RELEASE_NO_CHARGE' }));
    const invoke = () => db.functions.invoke('generate-credit-note', { body: { invoiceId: runId, reason: 'RECETTE AUTORISÉE — AUCUN REMBOURSEMENT RÉEL', validationRunId: runId } });
    stage = 'first_credit';
    const first = await invoke(); check(first);
    if (first.data?.success !== true) throw new Error('Credit not confirmed');
    stage = 'repeated_credit';
    const retry = await invoke(); check(retry);
    if (retry.data?.success !== true || first.data.creditNote.id !== retry.data.creditNote.id) throw new Error('Idempotency failed');
    stage = 'verify_ledger';
    const originals = await db.from('invoices').select('status').eq('id', runId).single(); check(originals);
    const credits = await db.from('invoices').select('id,amount_ht,amount_ttc,pdf_url,facturx_url,invoice_number').eq('related_invoice_id', runId).eq('invoice_type', 'credit_note'); check(credits);
    if (originals.data?.status !== 'cancelled' || credits.data?.length !== 1 || Number(credits.data[0].amount_ttc) !== -100 || Number(credits.data[0].amount_ht) !== -100) throw new Error('Ledger mismatch');
    const credit = credits.data[0];
    if (credit.invoice_number !== 'TEST-AV-' + runId) throw new Error('Test numbering missing');
    stage = 'verify_documents';
    const html = await db.storage.from('invoices').download(credit.pdf_url); check(html);
    const xml = await db.storage.from('invoices').download(credit.facturx_url); check(xml);
    const htmlText = await html.data!.text(); const xmlText = await xml.data!.text();
    if (!htmlText.includes('TEST-AV-' + runId) || htmlText.includes('Altio SAS') || !xmlText.includes('<ram:TypeCode>381</ram:TypeCode>') || xmlText.includes('FR00000000000')) throw new Error('Document content mismatch');
    proof = { firstCall: 'passed', repeatedCall: 'same_credit', creditCount: 1, amountTtc: -100, originalState: 'cancelled',
      htmlBytes: htmlText.length, xmlBytes: xmlText.length, testNumbering: true, stripeOperations: 0, customerRecordsChanged: 0 };
  } catch { failed = true; }
  finally {
    // Every deletion is scoped to this hard-coded test invoice or to user IDs
    // created successfully by this invocation. No customer row is selected.
    if (users.length) {
      const attempt = async (name: string, fn: () => PromiseLike<{ error?: unknown }>) => { try { check(await fn()); } catch { cleanupErrors.push(name); } };
      const prefix = new Date().getUTCFullYear() + '/TEST-AV-' + runId;
      await attempt('test_documents', () => db.storage.from('invoices').remove([prefix + '.html', prefix + '.xml']));
      await attempt('test_job', () => db.from('credit_note_jobs').delete().eq('invoice_id', runId));
      await attempt('test_credit', () => db.from('invoices').delete().eq('related_invoice_id', runId).eq('invoice_type', 'credit_note'));
      await attempt('test_original', () => db.from('invoices').delete().eq('id', runId).eq('invoice_number', 'TEST-RELEASE-' + runId));
      for (const id of users) {
        await attempt('test_profile', () => db.from('users').delete().eq('id', id));
        await attempt('test_auth', () => db.auth.admin.deleteUser(id));
      }
    }
  }
  return Response.json({ ok: !failed && cleanupErrors.length === 0, runId, proof, failureStage: failed ? stage : null, cleaned: cleanupErrors.length === 0, cleanupErrors }, { status: failed || cleanupErrors.length ? 500 : 200 });
});
