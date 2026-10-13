import { getMissionTypeLabel } from '../serviceLabels';
import { getMissionServices, isUrgentMission, ownerMissionAction, toggleMissionService, validateMissionServices, missionRoute, localDateKey } from '../missionPresentation';

describe('One owner mission, independent services / priority / progress', () => {
  it('combines cleaning and linen without combining unrelated trades', () => {
    expect(toggleMissionService(['cleaning'], 'linen')).toEqual(['cleaning', 'linen']);
    expect(toggleMissionService(['cleaning', 'linen'], 'linen')).toEqual(['cleaning']);
    expect(toggleMissionService(['cleaning', 'linen'], 'plumbing')).toEqual(['plumbing']);
    expect(toggleMissionService(['plumbing'], 'cleaning')).toEqual(['cleaning']);
    expect(validateMissionServices(['cleaning', 'linen'])).toBeNull();
    expect(validateMissionServices(['cleaning', 'electrical'])).toBeTruthy();
    expect(validateMissionServices([])).toBeTruthy();
  });
  it('labels both services, while retaining compatibility with old missions', () => {
    expect(getMissionTypeLabel('cleaning', ['cleaning', 'linen'])).toBe('Ménage + Linge');
    expect(getMissionTypeLabel('cleaning', [])).toBe('Ménage');
    expect(getMissionServices({ mission_type: 'cleaning', services: [] })).toEqual(['cleaning']);
  });
  it('does not confuse repair workflow with urgency', () => {
    expect(isUrgentMission({ is_emergency: true, scheduled_date: '2026-10-10T12:00:00Z' })).toBe(false);
    expect(isUrgentMission({ is_emergency: true })).toBe(true);
    expect(isUrgentMission({ is_emergency: false, priority: 'urgent' })).toBe(true);
    expect(isUrgentMission({ is_emergency: true, priority: 'normal' })).toBe(false);
    expect(isUrgentMission({ is_emergency: true, priority: 'urgent', scheduled_date: '2026-10-10T12:00:00Z' })).toBe(true);
  });
  it('only asks the owner to act when an actionable response exists', () => {
    expect(ownerMissionAction({ status: 'pending', is_emergency: true, raw_status: 'bids_open' })).toBeNull();
    expect(ownerMissionAction({ status: 'pending', is_emergency: true, raw_status: 'bids_open', bids_count: 2 })).toBe('Choisir un prestataire');
    expect(ownerMissionAction({ status: 'in_progress', is_emergency: true, raw_status: 'quote_sent' })).toBe('Valider le devis');
    expect(ownerMissionAction({ status: 'in_progress', is_emergency: true, raw_status: 'quote_paid' })).toBeNull();
    expect(ownerMissionAction({ status: 'pending', applications_count: 2 })).toBe('Choisir un prestataire');
    expect(ownerMissionAction({ status: 'pending' }, true)).toBe('Choisir un prestataire');
    expect(ownerMissionAction({ status: 'cancelled', applications_count: 2 })).toBeNull();
    expect(ownerMissionAction({ status: 'awaiting_payment' })).toBe('Valider et payer la mission');
  });
  it('opens the correct workflow even for planned repairs', () => {
    expect(missionRoute({ mission_id: 'repair-1', is_emergency: true })).toBe('/emergency?id=repair-1');
    expect(missionRoute({ mission_id: 'clean-1', is_emergency: false })).toBe('/mission/clean-1');
  });
  it('uses local calendar dates rather than slicing UTC timestamps', () => {
    const date = new Date(2026, 9, 3, 0, 30);
    expect(localDateKey(date)).toBe('2026-10-03');
  });
});
