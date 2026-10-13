import { quotePrice } from '../quotePrice';

describe('montant affiché avant paiement du devis', () => {
  it('ajoute la TVA enregistrée puis 10 % du HT en frais de service', () => {
    expect(quotePrice({ repair_cost: 100, tva_rate: 0.2 })).toEqual({ subtotal: 100, vat: 20, service: 120, fee: 10, total: 130, payout: 110 });
  });
  it('respecte l’exonération de TVA', () => {
    expect(quotePrice({ repair_cost: 100, tva_rate: 0.2, is_vat_exempt: true }).total).toBe(110);
  });
  it('arrondit les composantes au centime', () => {
    expect(quotePrice({ repair_cost: 19.99, tva_rate: 0.2 })).toEqual({ subtotal: 19.99, vat: 4, service: 23.99, fee: 2, total: 25.99, payout: 21.99 });
  });
  it('utilise les lignes plutôt que l’ancien total et respecte un prix nul', () => {
    expect(quotePrice({ repair_cost: 100, is_vat_exempt: true, line_items: [
      { id: 'a', quote_id: 'q', description: 'offert', quantity: 1, unit_price_ht: 0, unit_price: 50, sort_order: 0 },
      { id: 'b', quote_id: 'q', description: 'prestation', quantity: 2, unit_price_ht: '20', unit_price: 20, sort_order: 1 },
    ] }).total).toBe(44);
  });
});
