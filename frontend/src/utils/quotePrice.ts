import { priceFromCents } from './commission';

type Amount = number | string | null;
type PriceLine = { quantity?: Amount; unit_price_ht?: Amount; unit_price?: Amount };
type PricedQuote<L extends PriceLine> = {
  line_items?: L[] | null;
  repair_cost?: Amount;
  tva_rate?: Amount;
  is_vat_exempt?: boolean | null;
};

export function quotePrice<L extends PriceLine>(quote: PricedQuote<L>) {
  const subtotal = quote.line_items?.length
    ? quote.line_items.reduce((sum, item) => sum + Number(item.quantity ?? 1) * Number(item.unit_price_ht ?? item.unit_price ?? 0), 0)
    : Number(quote.repair_cost ?? 0);
  const vatRate = quote.is_vat_exempt === true ? 0 : Number(quote.tva_rate ?? 0.20);
  const vatCents = Math.round(subtotal * vatRate * 100);
  const htCents = Math.round(subtotal * 100);
  const { service, fee, total, payout } = priceFromCents(htCents + vatCents, htCents);
  return { subtotal, vat: vatCents / 100, service, fee, total, payout };
}
