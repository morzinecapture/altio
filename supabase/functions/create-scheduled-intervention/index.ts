// ══════════════════════════════════════════════════════════════════
// Edge Function : create-scheduled-intervention
//
// Phase 8 / Vague 2 — Création d'une intervention scheduled avec
// éventuelle attribution prioritaire au favori primary du proprio pour
// le service_type demandé (FLOW.md §3.A.1 / §4.B.2 / §9.5).
//
// Flow :
//   - Si favori primary trouvé (via RPC find_primary_favorite_provider) :
//       * Crée intervention avec target_provider_id = favori
//       * favorites_only_until = NOW() + 24h
//       * Push dédié au favori : « Nouvelle mission proposée en priorité »
//       * PAS de broadcast zone tant que le timeout n'est pas passé
//   - Sinon :
//       * Crée intervention normale (target_provider_id NULL)
//       * Les policies broadcast reprennent la main (FLOW.md §3.A.1)
//
// Input : { property_id, service_type, mission_type?, description?,
//           scheduled_at?, pricing_mode?, fixed_price?, photos? }
// Output : { intervention, notifiedFavorite: boolean, favoriteProviderId?: string }
//
// Garde serveur : rejette mode=asap (Option C §10 — urgence legacy).
// ══════════════════════════════════════════════════════════════════

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAuth } from "../_shared/auth.ts";
import { assertUUID, assertString, ValidationError } from "../_shared/validate.ts";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { checkRateLimit } from "../_shared/rateLimit.ts";

const FN = "create-scheduled-intervention";

// FLOW.md §6.3 — 48h min pour une mission scheduled
const SCHEDULED_MIN_LEAD_MS = 48 * 60 * 60 * 1000;
// FLOW.md §3.A.1 — délai favori pour une mission scheduled
const FAVORITE_DEADLINE_MS = 24 * 60 * 60 * 1000;

class OperationalError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "OperationalError";
    this.status = status;
  }
}

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
  const requestId = crypto.randomUUID();

  try {
    const { user } = await requireAuth(req);
    try {
      await checkRateLimit(user.id, "create_scheduled_intervention", 20, 60_000);
    } catch (rateErr) {
      const msg = rateErr instanceof Error ? rateErr.message : String(rateErr);
      throw new OperationalError(msg, 429);
    }

    const body = await req.json();
    const propertyId = assertUUID(body.property_id, "property_id");
    const serviceType = assertString(body.service_type, "service_type");
    const missionType: string = typeof body.mission_type === "string" && body.mission_type.length > 0
      ? body.mission_type
      : serviceType;
    const description: string | null = typeof body.description === "string" ? body.description : null;
    const scheduledAtRaw: string | null = typeof body.scheduled_at === "string" ? body.scheduled_at : null;
    const pricingMode: string = typeof body.pricing_mode === "string" ? body.pricing_mode : "open_bid";
    const fixedPrice: number | null = typeof body.fixed_price === "number" ? body.fixed_price : null;
    const mode: string = typeof body.mode === "string" ? body.mode : "scheduled";
    const photos: string[] = Array.isArray(body.photos)
      ? body.photos.filter((url: unknown): url is string => typeof url === "string" && url.length > 0).slice(0, 8)
      : [];

    // Option C §10 : mode=asap verrouillé ici aussi
    if (mode !== "scheduled") {
      return respond({
        success: false,
        error: "Le mode ASAP n'est pas encore migré, utilisez le flux urgence.",
      }, 400);
    }

    // Validation pricing (le trigger SQL fait aussi la garde)
    if (!["fixed", "open_bid"].includes(pricingMode)) {
      return respond({
        success: false,
        error: "pricing_mode doit valoir 'fixed' ou 'open_bid' à la création.",
      }, 400);
    }
    if (pricingMode === "fixed" && (!fixedPrice || fixedPrice <= 0)) {
      return respond({
        success: false,
        error: "Un prix fixe strictement positif est requis quand pricing_mode='fixed'.",
      }, 400);
    }
    if (pricingMode === "open_bid" && fixedPrice !== null) {
      return respond({
        success: false,
        error: "fixed_price doit être absent (null) quand pricing_mode='open_bid'.",
      }, 400);
    }

    // Validation date -48h
    if (scheduledAtRaw) {
      const scheduledMs = new Date(scheduledAtRaw).getTime();
      if (Number.isNaN(scheduledMs)) {
        return respond({ success: false, error: "scheduled_at invalide." }, 400);
      }
      if (scheduledMs < Date.now() + SCHEDULED_MIN_LEAD_MS) {
        return respond({
          success: false,
          error: "Une mission planifiée doit être à plus de 48 heures (FLOW.md §6.3).",
        }, 400);
      }
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseService = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !supabaseService) {
      log("error", "missing_supabase_secrets", { requestId });
      return respond({
        success: false,
        error: "Configuration serveur incomplète. Contactez le support Altio.",
      }, 500);
    }
    const db = createClient(supabaseUrl, supabaseService);

    // Garde propriété : doit appartenir à l'owner caller
    const { data: prop, error: propErr } = await db
      .from("properties")
      .select("id, owner_id, name, city")
      .eq("id", propertyId)
      .maybeSingle();
    if (propErr || !prop) {
      log("warn", "property_not_found", { requestId, propertyId, err: propErr?.message });
      return respond({ success: false, error: "Propriété introuvable." }, 404);
    }
    if (prop.owner_id !== user.id) {
      return respond({ success: false, error: "Cette propriété ne vous appartient pas." }, 403);
    }

    // Lookup favori primary (FLOW.md §9.5)
    const { data: favRow, error: favErr } = await db.rpc("find_primary_favorite_provider", {
      p_owner_id: user.id,
      p_service_type: serviceType,
    });
    if (favErr) {
      log("error", "favorite_lookup_failed", {
        requestId,
        err: favErr.message,
        code: favErr.code,
      });
      throw new OperationalError(
        "La configuration des prestataires favoris est indisponible. Vérifiez les migrations Supabase puis réessayez.",
        500,
      );
    }
    const favoriteId: string | null = typeof favRow === "string" && favRow.length > 0 ? favRow : null;

    const insert: Record<string, unknown> = {
      owner_id: user.id,
      property_id: propertyId,
      mode: "scheduled",
      phase: "visit_pending",
      service_type: serviceType,
      mission_type: missionType,
      description,
      photos,
      scheduled_at: scheduledAtRaw,
      payment_mode: "pending",
      pricing_mode: pricingMode,
      fixed_price: fixedPrice,
    };

    let notifiedFavorite = false;
    if (favoriteId) {
      insert.target_provider_id = favoriteId;
      insert.favorites_only_until = new Date(Date.now() + FAVORITE_DEADLINE_MS).toISOString();
      notifiedFavorite = true;
    }

    const { data: iv, error: insErr } = await db
      .from("interventions")
      .insert(insert)
      .select("*")
      .single();

    if (insErr || !iv) {
      log("error", "insert_failed", { requestId, err: insErr?.message, code: insErr?.code });
      return respond({
        success: false,
        error: insErr?.message || "Création intervention échouée.",
      }, 500);
    }
    log("info", "intervention_created", { requestId, interventionId: iv.id, notifiedFavorite, favoriteId });

    // Push favori prioritaire
    if (notifiedFavorite && favoriteId) {
      try {
        await db.functions.invoke("send-push", {
          body: {
            userId: favoriteId,
            title: "Mission proposée en priorité",
            body: `Nouvelle mission ${missionType} à ${prop.city || "proximité"} — répondez dans les 24h.`,
            data: { interventionId: iv.id, type: "favorite_priority" },
            notifType: "intervention",
            referenceId: iv.id,
          },
        });
      } catch (e) {
        log("warn", "push_favorite_failed", {
          requestId,
          err: e instanceof Error ? e.message : String(e),
        });
      }
    }

    return respond({
      success: true,
      data: {
        intervention: iv,
        notifiedFavorite,
        favoriteProviderId: favoriteId,
      },
    });
  } catch (err) {
    if (err instanceof ValidationError) {
      return respond({ success: false, error: err.message }, 400);
    }
    if (err instanceof OperationalError) {
      log("warn", "operational_error", { requestId, err: err.message, status: err.status });
      return respond({ success: false, error: err.message, requestId }, err.status);
    }
    const msg = err instanceof Error ? err.message : String(err);
    const isAuth = /authorization|token/i.test(msg);
    log("error", "unhandled", { requestId, err: msg });
    return respond({
      success: false,
      error: isAuth
        ? "Session expirée, veuillez vous reconnecter"
        : `Erreur interne serveur. Réessayez dans un instant. Référence : ${requestId}`,
    }, isAuth ? 401 : 500);
  }
});
