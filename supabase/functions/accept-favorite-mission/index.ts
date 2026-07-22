// ══════════════════════════════════════════════════════════════════
// Edge Function : accept-favorite-mission
//
// Phase 8 / Vague 2 — Acceptation directe d'une mission par le favori
// ciblé. Ne passe PAS par une candidature : le favori voit le prix (mode
// fixed) ou les hints (mode open_bid) et clique « Accepter ».
//
// Flow (FLOW.md §9.1) :
//   1. Favori (= target_provider_id) appelle cette Edge Function.
//   2. Garde : phase='visit_pending', caller=target_provider_id.
//   3. Transition : visit_pending → accepted_waiting_payment.
//   4. Insert intervention_bids { provider_id=caller, status='accepted' }
//      pour tracer. Les fees sont zéro quand pricing_mode='fixed' (le
//      prix vient de intervention.fixed_price).
//   5. Set assigned_provider_id = caller.
//   6. Set payment_expected_by = NOW() + 12h (deadline paiement owner).
//   7. Push owner : « Votre favori [nom] a accepté. Confirmez le paiement. »
//
// Input : { interventionId }
// Output : { intervention }
//
// Le paiement Stripe se déclenche ensuite côté owner via le flux normal
// (bouton « Confirmer le paiement » dans l'écran détail, qui ouvre
// accept-intervention-bid sur le bid fraichement créé).
// ══════════════════════════════════════════════════════════════════

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAuth } from "../_shared/auth.ts";
import { assertUUID, ValidationError } from "../_shared/validate.ts";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { checkRateLimit } from "../_shared/rateLimit.ts";

const FN = "accept-favorite-mission";

// FLOW.md §9.1 — délai paiement owner
const PAYMENT_DEADLINE_MS = 12 * 60 * 60 * 1000;

function log(level: string, msg: string, context: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ level, msg, fn: FN, ...context }));
}

function respond(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const { user } = await requireAuth(req);
    await checkRateLimit(user.id, "accept_favorite_mission", 10, 60_000);

    const body = await req.json();
    const interventionId = assertUUID(body.interventionId, "interventionId");

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseService = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !supabaseService) {
      log("error", "missing_supabase_secrets");
      return respond({
        success: false,
        error: "Configuration serveur incomplète. Contactez le support Altio.",
      }, 500);
    }
    const db = createClient(supabaseUrl, supabaseService);

    // 1. Fetch + garde
    const { data: iv, error: ivErr } = await db
      .from("interventions")
      .select(
        "id, owner_id, target_provider_id, assigned_provider_id, phase, pricing_mode, fixed_price, service_type, property_id, favorites_only_until",
      )
      .eq("id", interventionId)
      .maybeSingle();

    if (ivErr || !iv) {
      return respond({ success: false, error: "Intervention introuvable." }, 404);
    }
    if (iv.target_provider_id !== user.id) {
      log("warn", "not_target_provider", {
        callerId: user.id,
        target: iv.target_provider_id,
      });
      return respond({
        success: false,
        error: "Cette mission ne vous est pas proposée en priorité.",
      }, 403);
    }
    if (iv.phase !== "visit_pending") {
      return respond({
        success: false,
        error: "Cette mission n'est plus en attente de votre réponse.",
      }, 409);
    }
    if (iv.favorites_only_until && new Date(iv.favorites_only_until).getTime() < Date.now()) {
      return respond({
        success: false,
        error: "Délai dépassé — la mission est désormais ouverte à tous les prestataires.",
      }, 409);
    }

    // 2. Insert bid pour tracer l'acceptation. Fees à 0 en mode fixed.
    const bidInsert: Record<string, unknown> = {
      intervention_id: interventionId,
      provider_id: user.id,
      status: "accepted",
      displacement_fee: 0,
      first_hour_fee: 0,
      hourly_rate: 0,
      diagnostic_fee: 0,
    };
    const { data: bid, error: bidErr } = await db
      .from("intervention_bids")
      .insert(bidInsert)
      .select("id")
      .single();
    if (bidErr || !bid) {
      log("error", "bid_insert_failed", { err: bidErr?.message });
      return respond({
        success: false,
        error: "Enregistrement de l'acceptation échoué. Réessayez.",
      }, 500);
    }

    // 3. Transition phase + assignation + deadline paiement
    const paymentExpectedBy = new Date(Date.now() + PAYMENT_DEADLINE_MS).toISOString();
    const { data: updatedIv, error: upErr } = await db
      .from("interventions")
      .update({
        phase: "accepted_waiting_payment",
        assigned_provider_id: user.id,
        payment_expected_by: paymentExpectedBy,
      })
      .eq("id", interventionId)
      .eq("phase", "visit_pending")
      .select("*")
      .single();

    if (upErr || !updatedIv) {
      log("error", "phase_update_failed", { err: upErr?.message, code: upErr?.code });
      // Rollback du bid
      await db.from("intervention_bids").delete().eq("id", bid.id);
      return respond({
        success: false,
        error: "Impossible de passer la mission en attente de paiement. Réessayez.",
      }, 500);
    }

    // 4. Récup nom du presta pour la notif
    const { data: prov } = await db
      .from("users")
      .select("name")
      .eq("id", user.id)
      .maybeSingle();
    const providerName = prov?.name || "Votre prestataire favori";

    // 5. Push owner (§9.1 point 2)
    try {
      await db.functions.invoke("send-push", {
        body: {
          userId: iv.owner_id,
          title: `${providerName} a accepté votre mission`,
          body: "Confirmez le paiement pour qu'il se déplace (12h max).",
          data: {
            interventionId,
            bidId: bid.id,
            type: "favorite_accepted_awaiting_payment",
          },
          notifType: "intervention",
          referenceId: interventionId,
        },
      });
    } catch (e) {
      log("warn", "push_owner_failed", {
        err: e instanceof Error ? e.message : String(e),
      });
    }

    return respond({
      success: true,
      data: {
        intervention: updatedIv,
        bidId: bid.id,
      },
    });
  } catch (err) {
    if (err instanceof ValidationError) {
      return respond({ success: false, error: err.message }, 400);
    }
    const msg = err instanceof Error ? err.message : String(err);
    const isAuth = /authorization|token/i.test(msg);
    log("error", "unhandled", { err: msg });
    return respond({
      success: false,
      error: isAuth
        ? "Session expirée, veuillez vous reconnecter"
        : "Erreur interne serveur. Réessayez dans un instant.",
    }, isAuth ? 401 : 500);
  }
});
