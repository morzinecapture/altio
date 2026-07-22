---
name: stripe-connect-payments
description: Intégration Stripe Connect pour Altio — paiements split entre propriétaire, prestataire et plateforme. Utilise cette skill dès qu'on parle de paiement, Stripe, Connect, onboarding prestataire, transfert, commission, pré-autorisation, capture, remboursement, ou flux financier.
---

# Stripe Connect — Altio

## Architecture financière
```
Propriétaire paie → Stripe (pré-autorisation)
                         ↓ (à la validation)
                    Capture le paiement
                         ↓
              Commission Altio retenue :
                → 10% côté propriétaire (ownerMultiplier = 1.10)
                → 10% côté prestataire (providerMultiplier = 0.90)
                         ↓
              Transfert vers le compte Connect du prestataire
```

## Flux anti-désintermédiation
Le système est conçu pour que les paiements passent toujours par Altio :
1. **Pré-autorisation** au moment de l'assignation (pas du broadcast)
2. **Capture** uniquement après completion validée
3. **Le prestataire n'a jamais les coordonnées de paiement du propriétaire**

## Onboarding Stripe Connect (prestataire)
```typescript
// services/payments.ts
export async function createConnectAccount(providerId: string) {
  // Appeler une Edge Function Supabase (le secret Stripe reste côté serveur)
  const { data, error } = await supabase.functions.invoke('create-connect-account', {
    body: { providerId },
  })
  // Retourne un lien d'onboarding Stripe
  return data.onboarding_url
}
```

### Edge Function côté serveur
```typescript
// supabase/functions/create-connect-account/index.ts
import Stripe from 'stripe'
const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!)

Deno.serve(async (req) => {
  const { providerId } = await req.json()

  const account = await stripe.accounts.create({
    type: 'express',
    country: 'FR',
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
    metadata: { altio_provider_id: providerId },
  })

  // Sauvegarder le stripe_account_id dans le profil
  await supabaseAdmin.from('provider_profiles').update({
    stripe_account_id: account.id,
  }).eq('id', providerId)

  // Créer le lien d'onboarding
  const link = await stripe.accountLinks.create({
    account: account.id,
    refresh_url: `${Deno.env.get('APP_URL')}/provider/stripe-refresh`,
    return_url: `${Deno.env.get('APP_URL')}/provider/stripe-complete`,
    type: 'account_onboarding',
  })

  return new Response(JSON.stringify({ onboarding_url: link.url }))
})
```

## Pré-autorisation (assignation de mission)
```typescript
// Edge Function: create-payment-intent
const paymentIntent = await stripe.paymentIntents.create({
  amount: Math.round(agreedPrice * 100), // En centimes
  currency: 'eur',
  capture_method: 'manual', // Pré-autorisation, pas de capture immédiate
  application_fee_amount: Math.round(agreedPrice * 0.20 * 100), // 20% total (10% proprio + 10% presta)
  transfer_data: {
    destination: providerStripeAccountId,
  },
  metadata: {
    mission_id: missionId,
    owner_id: ownerId,
    provider_id: providerId,
  },
})
```

## Capture (après validation)
```typescript
// Edge Function: capture-payment
const captured = await stripe.paymentIntents.capture(paymentIntentId)
// Le transfert vers le prestataire est automatique après capture
```

## Règles strictes
- JAMAIS de clé Stripe secrète côté client (React Native)
- Toutes les opérations Stripe passent par des Edge Functions Supabase
- Toujours `capture_method: 'manual'` pour les missions (pré-auth → capture)
- La pré-autorisation expire après 7 jours — prévoir un renouvellement
- Vérifier `stripe_account_id` du prestataire avant d'assigner une mission
- Webhook Stripe pour confirmer les événements (payment_intent.succeeded, etc.)
- Commission Altio : 10% propriétaire + 10% prestataire, définie dans `frontend/src/config/billing.ts` (`PLATFORM_FEE_RATE = 0.10`)

## TVA sur les devis
- TVA 20% par défaut
- TVA 10% pour travaux de rénovation (flag `is_renovation` sur `mission_quotes`)
- TVA 0% pour auto-entrepreneurs (flag `is_vat_exempt` sur `users` + `mission_quotes`)
- Le taux est sauvegardé dans `mission_quotes.tva_rate` au moment de la création du devis
- L'Edge Function `generate-quote` lit `mission_quotes.tva_rate` en priorité, fallback sur le statut du prestataire
