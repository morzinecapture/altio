import { supabase, checkError, checkFunctionError } from './_client';

export type CompletionPhase = 'visit' | 'repair';
export type CompletionStep = {
  id: string; emergency_id: string; phase: CompletionPhase;
  status: 'pending' | 'processing' | 'paid' | 'disputed' | 'payment_required';
  due_at: string; declared_at: string; disputed_at: string | null; paid_at: string | null;
  finish_emergency?: boolean;
  invoiced_at?: string | null; invoice_error?: string | null;
};
export async function getCompletionSteps(emergencyId: string): Promise<CompletionStep[]> {
  const { data, error } = await supabase.from('emergency_completion_steps').select('id,emergency_id,phase,status,due_at,declared_at,disputed_at,paid_at,finish_emergency,invoiced_at,invoice_error').eq('emergency_id', emergencyId);
  checkError(error); return data || [];
}
export async function getCompletionStepsForMissions(emergencyIds: string[]): Promise<CompletionStep[]> {
  if (!emergencyIds.length) return [];
  const { data, error } = await supabase.from('emergency_completion_steps')
    .select('id,emergency_id,phase,status,due_at,declared_at,disputed_at,paid_at,finish_emergency,invoiced_at,invoice_error')
    .in('emergency_id', emergencyIds);
  checkError(error); return data || [];
}
export async function completionAction(emergencyId: string, phase: CompletionPhase, action: 'declare' | 'approve' | 'dispute', options: { reason?: string; finishEmergency?: boolean } = {}) {
  const { data, error } = await supabase.functions.invoke('emergency-completion', { body: { emergencyId, phase, action, ...options } });
  await checkFunctionError(error);
  if (data?.error) throw new Error(data.error);
  if (!data?.step?.id) throw new Error('La déclaration n’a pas été confirmée par le serveur.');
  return { ok: true, ...data };
}
