import type { CompletionStep } from '../api/completion';
/** The storage/workflow (is_emergency) is independent of the requested priority. */
export type MissionPriority = 'normal' | 'urgent';
export type MissionSummary = {
  completion_steps?: CompletionStep[];
  mission_id?: string; id?: string; mission_type?: string; services?: string[] | null;
  is_emergency?: boolean; priority?: MissionPriority; scheduled_date?: string | null;
  status: string; raw_status?: string; applications_count?: number; bids_count?: number;
};
export const REPAIR_SERVICES = ['plumbing', 'electrical', 'locksmith', 'heating', 'jacuzzi', 'maintenance'] as const;
export const MISSION_SERVICES = ['cleaning', 'linen', ...REPAIR_SERVICES] as const;
export const LINEN_OPTIONS = ['Remplacer avec le linge propre sur place', 'Laver, sécher et remettre en place', 'Fournir le linge et récupérer le linge sale'] as const;
export const isRepairService = (service: string) => (REPAIR_SERVICES as readonly string[]).includes(service);
export function toggleMissionService(selected: string[], service: string): string[] {
  if (selected.includes(service)) return selected.filter(value => value !== service);
  // Each trade keeps its own provider, quote and completion. Cleaning and linen share a job.
  return isRepairService(service) ? [service] : [...selected.filter(value => !isRepairService(value)), service];
}
export function getMissionServices(mission: Pick<MissionSummary, 'mission_type' | 'services'>): string[] {
  const services = Array.isArray(mission.services) ? mission.services.filter(s => typeof s === 'string') : [];
  return services.length ? [...new Set(services)] : mission.mission_type ? [mission.mission_type] : [];
}
export function isUrgentMission(mission: Pick<MissionSummary, 'priority' | 'is_emergency' | 'scheduled_date'>): boolean {
  return mission.priority ? mission.priority === 'urgent' : !!mission.is_emergency && !mission.scheduled_date;
}
export const missionRoute = (mission: Pick<MissionSummary, 'mission_id' | 'id' | 'is_emergency'>) =>
  mission.is_emergency ? `/emergency?id=${mission.mission_id || mission.id}` as const : `/mission/${mission.mission_id || mission.id}` as const;
export const isActiveMission = (mission: Pick<MissionSummary, 'status'>) =>
  !['completed', 'paid', 'cancelled', 'refunded', 'expired', 'rejected'].includes(mission.status);
export function ownerMissionAction(mission: MissionSummary, hasApplications = false): string | null {
  if (!isActiveMission(mission)) return null;
  if (mission.is_emergency) {
    if (mission.completion_steps?.some(step => step.status === 'pending' && !step.paid_at && !step.disputed_at)) return 'Valider la fin d’intervention';
    const status = mission.raw_status || mission.status;
    if (['quote_sent', 'quote_submitted'].includes(status)) return 'Valider le devis';
    if (status === 'bids_open' && (mission.bids_count || 0) > 0) return 'Choisir un prestataire';
    if (status === 'awaiting_payment') return 'Régler l’intervention';
    return null;
  }
  if (mission.status === 'validated') return 'Régler la mission';
  if (mission.status === 'awaiting_payment') return 'Valider et payer la mission';
  if (['pending', 'pending_provider_approval'].includes(mission.status) && (hasApplications || (mission.applications_count || 0) > 0)) return 'Choisir un prestataire';
  return null;
}
export function validateMissionServices(services: string[]): string | null {
  if (!services.length) return 'Choisissez au moins une prestation.';
  if (services.some(s => !(MISSION_SERVICES as readonly string[]).includes(s))) return 'Cette prestation n’est pas disponible.';
  if (services.length > 1 && services.some(isRepairService)) return 'Créez une mission distincte pour chaque métier. Le ménage et le linge peuvent être regroupés.';
  return null;
}
export function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
