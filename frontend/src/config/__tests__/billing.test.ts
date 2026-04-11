import { PLATFORM_FEE_RATE, ownerMultiplier, providerMultiplier } from '../billing';

describe('billing config', () => {
  test('platform fee rate is 10%', () => {
    expect(PLATFORM_FEE_RATE).toBe(0.10);
  });

  test('owner multiplier adds 10%', () => {
    expect(ownerMultiplier).toBe(1.10);
  });

  test('provider multiplier subtracts 10%', () => {
    expect(providerMultiplier).toBe(0.90);
  });

  test('for a 200€ prestation, owner pays 220€', () => {
    const baseRate = 200;
    expect(baseRate * ownerMultiplier).toBeCloseTo(220, 2);
  });

  test('for a 200€ prestation, provider receives 180€', () => {
    const baseRate = 200;
    expect(baseRate * providerMultiplier).toBeCloseTo(180, 2);
  });

  test('Altio margin is 20% of base rate', () => {
    const baseRate = 200;
    const ownerPays = baseRate * ownerMultiplier;
    const providerReceives = baseRate * providerMultiplier;
    const altioMargin = ownerPays - providerReceives;
    expect(altioMargin).toBeCloseTo(40, 2);
    expect(altioMargin / baseRate).toBeCloseTo(0.20, 2);
  });

  test('application_fee_amount formula (amount * 2/11) gives correct split', () => {
    // Stripe splits: owner pays 220€, provider gets 180€, Altio keeps 40€
    // In Stripe Connect: total charge = 220€, application_fee = 220 * 2/11 = 40€
    const totalCharge = 220;
    const applicationFee = totalCharge * 2 / 11;
    expect(applicationFee).toBeCloseTo(40, 2);
  });
});
