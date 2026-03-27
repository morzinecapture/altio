import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { checkRateLimit } from '../_shared/rateLimit.ts'
import { corsHeaders, handleCors } from '../_shared/cors.ts'

serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    // Verify the caller is authenticated via their JWT
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Missing authorization header')

    const supabaseUrl = Deno.env.get('SUPABASE_URL') as string
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') as string
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') as string

    // Client scoped to the calling user (for RLS-safe reads)
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    // Admin client for privileged operations
    const adminClient = createClient(supabaseUrl, supabaseServiceKey)

    // Resolve the caller's user id from their token
    const { data: { user }, error: userError } = await userClient.auth.getUser()
    if (userError || !user) throw new Error('Invalid or expired token')

    const userId = user.id

    // Rate limiting: max 10 delete attempts per 24h (security)
    await checkRateLimit(userId, 'delete_account', 3, 86_400_000)

    // ── 1. Detach invoices from user's emergency_requests & missions ──────────
    // invoices.emergency_id FK blocks emergency_requests deletion
    // invoices.mission_id FK blocks missions deletion
    try {
      // Get user's emergency request IDs
      const { data: userEmergencies } = await adminClient
        .from('emergency_requests').select('id').eq('owner_id', userId)
      if (userEmergencies?.length) {
        const eIds = userEmergencies.map((e: { id: string }) => e.id)
        for (const eid of eIds) {
          await adminClient.from('invoices').update({ emergency_id: null }).eq('emergency_id', eid)
        }
      }
      // Get user's mission IDs
      const { data: userMissions } = await adminClient
        .from('missions').select('id').eq('owner_id', userId)
      if (userMissions?.length) {
        const mIds = userMissions.map((m: { id: string }) => m.id)
        for (const mid of mIds) {
          await adminClient.from('invoices').update({ mission_id: null }).eq('mission_id', mid)
        }
      }
      // Also null out seller/buyer FK to users
      await adminClient.from('invoices').update({ seller_id: null }).eq('seller_id', userId)
      await adminClient.from('invoices').update({ buyer_id: null }).eq('buyer_id', userId)
    } catch (_) { /* non-blocking */ }

    // ── 2. Delete notifications ─────────────────────────────────────────────
    try {
      await adminClient.from('notifications').delete().eq('user_id', userId)
    } catch (_) { /* non-blocking */ }

    // ── 3. Delete push tokens ───────────────────────────────────────────────
    try {
      await adminClient.from('push_tokens').delete().eq('user_id', userId)
    } catch (_) { /* non-blocking */ }

    // ── 4. Delete reclamations ──────────────────────────────────────────────
    try {
      await adminClient.from('reclamations').delete().eq('user_id', userId)
    } catch (_) { /* non-blocking */ }

    // ── 5. Delete mission photos ────────────────────────────────────────────
    try {
      await adminClient.from('mission_photos').delete().eq('provider_id', userId)
    } catch (_) { /* non-blocking */ }

    // ── 6. Delete invoice mandate counters ──────────────────────────────────
    try {
      await adminClient.from('invoice_mandate_counters').delete().eq('provider_id', userId)
    } catch (_) { /* non-blocking */ }

    // ── 7. Cancel active missions (owner side) + null out FK reference ──────
    await adminClient
      .from('missions')
      .update({ status: 'cancelled', owner_id: null })
      .eq('owner_id', userId)
      .in('status', ['pending', 'assigned', 'in_progress'])

    // Null out owner_id on ALL missions so FK doesn't block deletion
    await adminClient
      .from('missions')
      .update({ owner_id: null })
      .eq('owner_id', userId)

    // ── 8. Cancel active missions (provider side) + null out FK reference ───
    await adminClient
      .from('missions')
      .update({ status: 'cancelled', assigned_provider_id: null })
      .eq('assigned_provider_id', userId)
      .in('status', ['assigned', 'in_progress'])

    await adminClient
      .from('missions')
      .update({ assigned_provider_id: null })
      .eq('assigned_provider_id', userId)

    // ── 9. Delete messages sent or received by this user ────────────────────
    try {
      await adminClient.from('messages').delete().eq('sender_id', userId)
      await adminClient.from('messages').delete().eq('receiver_id', userId)
    } catch (_) { /* non-blocking */ }

    // ── 10. Delete emergency bids by this provider ──────────────────────────
    try {
      await adminClient.from('emergency_bids').delete().eq('provider_id', userId)
    } catch (_) { /* non-blocking */ }

    // ── 10b. Delete ALL bids/quotes on this owner's emergency requests ──────
    // Without this, bids from OTHER providers block emergency_requests deletion
    try {
      const { data: ownerEmergencies } = await adminClient
        .from('emergency_requests').select('id').eq('owner_id', userId)
      if (ownerEmergencies?.length) {
        const emergencyIds = ownerEmergencies.map((e: { id: string }) => e.id)
        await adminClient.from('emergency_bids').delete().in('emergency_request_id', emergencyIds)
        await adminClient.from('mission_quotes').delete().in('emergency_request_id', emergencyIds)
      }
    } catch (_) { /* non-blocking */ }

    // ── 11. Null out accepted_provider_id on emergency requests ─────────────
    try {
      await adminClient.from('emergency_requests').update({ accepted_provider_id: null }).eq('accepted_provider_id', userId)
    } catch (_) { /* non-blocking */ }

    // ── 12. Delete mission quotes (+ cascade quote_line_items) & quotes ─────
    try {
      await adminClient.from('mission_quotes').delete().eq('provider_id', userId)
      await adminClient.from('quotes').delete().eq('provider_id', userId)
    } catch (_) { /* non-blocking */ }

    // ── 13. Delete provider schedule ────────────────────────────────────────
    try {
      await adminClient.from('provider_schedule').delete().eq('provider_id', userId)
    } catch (_) { /* non-blocking */ }

    // ── 14. Delete mission applications by this user ────────────────────────
    try {
      await adminClient.from('mission_applications').delete().eq('provider_id', userId)
    } catch (_) { /* non-blocking */ }

    // ── 15. Delete reviews involving this user ──────────────────────────────
    try {
      await adminClient.from('reviews').delete().eq('owner_id', userId)
      await adminClient.from('reviews').delete().eq('provider_id', userId)
    } catch (_) { /* non-blocking */ }

    // ── 16. Delete provider profile ─────────────────────────────────────────
    try {
      await adminClient.from('provider_profiles').delete().eq('provider_id', userId)
    } catch (_) { /* non-blocking */ }

    // ── 17. Delete reservations owned by this user ──────────────────────────
    try {
      await adminClient.from('reservations').delete().eq('owner_id', userId)
    } catch (_) { /* non-blocking */ }

    // ── 18. Delete emergency requests owned by this user ────────────────────
    try {
      await adminClient.from('emergency_requests').delete().eq('owner_id', userId)
    } catch (_) { /* non-blocking */ }

    // ── 19. Delete properties owned by this user (missions already nulled) ──
    try {
      await adminClient.from('properties').delete().eq('owner_id', userId)
    } catch (_) { /* non-blocking */ }

    // ── 20. Delete user photos from storage ─────────────────────────────────
    try {
      const { data: files } = await adminClient.storage
        .from('user-uploads')
        .list(userId)
      if (files && files.length > 0) {
        const paths = files.map((f: { name: string }) => `${userId}/${f.name}`)
        await adminClient.storage.from('user-uploads').remove(paths)
      }
    } catch (_) {
      // Non-blocking
    }

    // ── 21. Null out audit_log admin_id + log deletion ──────────────────────
    try {
      await adminClient.from('audit_log').update({ admin_id: null }).eq('admin_id', userId)
      await adminClient.from('audit_log').insert({
        admin_id: null,
        action: 'delete_account',
        target_type: 'user',
        target_id: userId,
        metadata: { email: user.email, deleted_at: new Date().toISOString() },
      })
    } catch (_) {
      // Non-blocking
    }

    // ── 22. Delete the public.users row ─────────────────────────────────────
    const { error: profileDeleteError } = await adminClient.from('users').delete().eq('id', userId)
    if (profileDeleteError) {
      console.error('[delete-account] public.users delete failed:', profileDeleteError.message)
      // Try to identify what's still blocking
      throw new Error(`Cannot delete user profile: ${profileDeleteError.message}`)
    }

    // ── 23. Delete the auth user ────────────────────────────────────────────
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId)
    if (deleteError) throw deleteError

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )
  } catch (error: unknown) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})
