import type { CompletionStep } from '../api/completion';

export type MissionFollowUpData = {
  status: string;
  raw_status?: string;
  is_emergency?: boolean;
  completion_steps?: CompletionStep[];
};

/** Presentation only: never substitute these groups for server payment/work states. */
export function providerMissionFollowUp(mission: MissionFollowUpData): string | null {
  const status = mission.raw_status || mission.status;
  if (['completed', 'paid', 'cancelled', 'refunded', 'expired'].includes(status)) return null;
  if (!mission.is_emergency) return ['awaiting_payment', 'validated'].includes(status) ? 'clientPayment' : null;

  const steps = mission.completion_steps || [];
  // A completed visit must not hide repair work that has subsequently been accepted.
  const repairInProgress = ['quote_accepted', 'quote_paid', 'in_progress'].includes(status);
  const step = steps.find(s => s.phase === 'repair') || (!repairInProgress ? steps.find(s => s.phase === 'visit') : undefined);
  if (step) {
    if (step.disputed_at || step.status === 'disputed') return 'completionDisputed';
    if (step.status === 'payment_required') return 'completionPaymentRequired';
    if (step.status === 'processing') return 'completionProcessing';
    if (!step.paid_at && step.status === 'pending') return 'completionWaiting';
    if (step.finish_emergency && (step.paid_at || step.status === 'paid')) return 'completionClosing';
  }
  if (['quote_sent', 'quote_submitted'].includes(status)) return 'quoteWaiting';
  if (['provider_accepted', 'bid_accepted', 'awaiting_payment'].includes(status)) return 'clientPayment';
  return null;
}
