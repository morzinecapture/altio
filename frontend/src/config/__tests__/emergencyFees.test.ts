import {
  MAX_DIAGNOSTIC_FEE_EUR,
  MAX_TRAVEL_FEE_EUR,
  MAX_VISIT_FEE_EUR,
  validateEmergencyFees,
} from '../emergencyFees';

describe('plafonds des frais d’urgence', () => {
  test('accepte les montants situés exactement aux plafonds compatibles', () => {
    expect(() => validateEmergencyFees(MAX_TRAVEL_FEE_EUR, MAX_VISIT_FEE_EUR - MAX_TRAVEL_FEE_EUR)).not.toThrow();
  });

  test.each([
    [MAX_TRAVEL_FEE_EUR + 1, 0, 'déplacement'],
    [0, MAX_DIAGNOSTIC_FEE_EUR + 1, 'diagnostic'],
    [MAX_TRAVEL_FEE_EUR, MAX_DIAGNOSTIC_FEE_EUR, 'total'],
    [-1, 20, 'montants valides'],
  ])('refuse déplacement=%s diagnostic=%s', (travel, diagnostic, message) => {
    expect(() => validateEmergencyFees(travel as number, diagnostic as number)).toThrow(message as string);
  });
});
