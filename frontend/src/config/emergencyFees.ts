export const MAX_TRAVEL_FEE_EUR = 80;
export const MAX_DIAGNOSTIC_FEE_EUR = 100;
export const MAX_VISIT_FEE_EUR = 150;

export const validateEmergencyFees = (travelFee: number, diagnosticFee: number): void => {
  if (!Number.isFinite(travelFee) || !Number.isFinite(diagnosticFee) || travelFee < 0 || diagnosticFee < 0) {
    throw new Error('Les frais de déplacement et de diagnostic doivent être des montants valides.');
  }
  if (travelFee > MAX_TRAVEL_FEE_EUR) {
    throw new Error(`Les frais de déplacement sont plafonnés à ${MAX_TRAVEL_FEE_EUR} €.`);
  }
  if (diagnosticFee > MAX_DIAGNOSTIC_FEE_EUR) {
    throw new Error(`Les frais de diagnostic sont plafonnés à ${MAX_DIAGNOSTIC_FEE_EUR} €.`);
  }
  if (travelFee + diagnosticFee > MAX_VISIT_FEE_EUR) {
    throw new Error(`Le total déplacement et diagnostic est plafonné à ${MAX_VISIT_FEE_EUR} €.`);
  }
};
