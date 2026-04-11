import { COMMISSION_RATE, OWNER_MARKUP_RATE, PROVIDER_PAYOUT_RATE } from '../utils/commission';

/** Platform fee rate charged to each party (owner + provider) */
export const PLATFORM_FEE_RATE = COMMISSION_RATE;

/** Owner pays: base amount * (1 + PLATFORM_FEE_RATE) */
export const ownerMultiplier = OWNER_MARKUP_RATE;

/** Provider receives: base amount * (1 - PLATFORM_FEE_RATE) */
export const providerMultiplier = PROVIDER_PAYOUT_RATE;
