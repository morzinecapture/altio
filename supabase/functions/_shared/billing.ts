export const PLATFORM_FEE_RATE = 0.10;
export const OWNER_MULTIPLIER = 1 + PLATFORM_FEE_RATE;
export const PROVIDER_MULTIPLIER = 1 - PLATFORM_FEE_RATE;

/** Payments created since the HT commission model carry this metadata version. */
export const HT_PRICING_VERSION = 'ht-v1';

/** HT part of a TTC price whose VAT rate is a fraction (0.20 = 20 %). */
export const htCentsFromTtc = (ttcCents: number, vatRate: number) =>
  vatRate === 0 ? ttcCents : Math.round(ttcCents / (1 + vatRate));

/**
 * Altio takes 10 % of the provider's HT price on each side:
 * the owner pays service TTC + fee, the provider receives service TTC - fee.
 */
export function htPricing(serviceCents: number, htCents: number) {
  if (!Number.isSafeInteger(serviceCents) || !Number.isSafeInteger(htCents) || htCents < 0 || htCents > serviceCents) {
    throw new Error('Montants de prestation incohérents');
  }
  const feeCents = Math.round(htCents * PLATFORM_FEE_RATE);
  return { serviceCents, htCents, feeCents, amount: serviceCents + feeCents, applicationFee: feeCents * 2 };
}

/** Application fee expected for an intent, legacy TTC model included. */
export function expectedApplicationFee(intent: { amount: number; metadata?: Record<string, string> | null }) {
  const meta = intent.metadata || {};
  if (meta.pricingVersion !== HT_PRICING_VERSION) return Math.round(intent.amount * 2 / 11);
  const serviceCents = Number(meta.serviceCents);
  const feeCents = Number(meta.feeCents);
  if (!Number.isSafeInteger(serviceCents) || !Number.isSafeInteger(feeCents) || feeCents < 0 || serviceCents + feeCents !== intent.amount) return NaN;
  return feeCents * 2;
}
