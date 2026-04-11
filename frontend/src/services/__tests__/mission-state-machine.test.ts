import {
  MISSION_TRANSITIONS,
  EMERGENCY_TRANSITIONS,
  isValidMissionTransition,
  isValidEmergencyTransition,
  assertMissionTransition,
  assertEmergencyTransition,
} from '../mission-state-machine';
import type { MissionStatus, EmergencyStatus } from '../../types/api';

// ─── Helpers ────────────────────────────────────────────────────────────────

const ALL_MISSION_STATUSES: MissionStatus[] = Object.keys(MISSION_TRANSITIONS) as MissionStatus[];
const ALL_EMERGENCY_STATUSES: EmergencyStatus[] = Object.keys(EMERGENCY_TRANSITIONS) as EmergencyStatus[];

// ─── Missions ───────────────────────────────────────────────────────────────

describe('Machine a etats des missions', () => {

  describe('isValidMissionTransition — transitions valides', () => {
    for (const [from, toList] of Object.entries(MISSION_TRANSITIONS)) {
      for (const to of toList) {
        it(`${from} -> ${to} est valide`, () => {
          expect(isValidMissionTransition(from as MissionStatus, to as MissionStatus)).toBe(true);
        });
      }
    }
  });

  describe('isValidMissionTransition — transitions invalides', () => {
    it('pending ne peut pas aller directement a in_progress', () => {
      expect(isValidMissionTransition('pending', 'in_progress')).toBe(false);
    });

    it('pending ne peut pas aller directement a assigned', () => {
      expect(isValidMissionTransition('pending', 'assigned')).toBe(false);
    });

    it('in_progress ne peut pas revenir a pending', () => {
      expect(isValidMissionTransition('in_progress', 'pending')).toBe(false);
    });

    it('in_progress ne peut pas revenir a assigned', () => {
      expect(isValidMissionTransition('in_progress', 'assigned')).toBe(false);
    });

    it('validated ne peut aller que vers paid', () => {
      const invalidTargets = ALL_MISSION_STATUSES.filter(s => s !== 'paid');
      for (const target of invalidTargets) {
        expect(isValidMissionTransition('validated', target)).toBe(false);
      }
    });

    it('assigned ne peut pas revenir a pending', () => {
      expect(isValidMissionTransition('assigned', 'pending')).toBe(false);
    });

    it('paid ne peut aller nulle part (etat terminal)', () => {
      for (const target of ALL_MISSION_STATUSES) {
        expect(isValidMissionTransition('paid', target)).toBe(false);
      }
    });

    it('cancelled ne peut aller nulle part (etat terminal)', () => {
      for (const target of ALL_MISSION_STATUSES) {
        expect(isValidMissionTransition('cancelled', target)).toBe(false);
      }
    });
  });

  describe('dispute — transitions specifiques', () => {
    it('dispute peut aller vers validated', () => {
      expect(isValidMissionTransition('dispute', 'validated')).toBe(true);
    });

    it('dispute peut aller vers cancelled', () => {
      expect(isValidMissionTransition('dispute', 'cancelled')).toBe(true);
    });

    it('dispute ne peut pas aller vers paid directement', () => {
      expect(isValidMissionTransition('dispute', 'paid')).toBe(false);
    });

    it('dispute ne peut pas aller vers in_progress', () => {
      expect(isValidMissionTransition('dispute', 'in_progress')).toBe(false);
    });

    it('dispute ne peut pas aller vers pending', () => {
      expect(isValidMissionTransition('dispute', 'pending')).toBe(false);
    });
  });

  describe('assertMissionTransition — ne lance pas sur transition valide', () => {
    it('pending -> cancelled ne lance pas', () => {
      expect(() => assertMissionTransition('pending', 'cancelled')).not.toThrow();
    });

    it('assigned -> in_progress ne lance pas', () => {
      expect(() => assertMissionTransition('assigned', 'in_progress')).not.toThrow();
    });

    it('dispute -> validated ne lance pas', () => {
      expect(() => assertMissionTransition('dispute', 'validated')).not.toThrow();
    });
  });

  describe('assertMissionTransition — lance sur transition invalide', () => {
    it('pending -> in_progress lance une erreur descriptive', () => {
      expect(() => assertMissionTransition('pending', 'in_progress')).toThrow(
        'Transition invalide : impossible de passer de "pending" à "in_progress".'
      );
    });

    it('paid -> pending lance une erreur', () => {
      expect(() => assertMissionTransition('paid', 'pending')).toThrow(/Transition invalide/);
    });

    it('cancelled -> pending lance une erreur', () => {
      expect(() => assertMissionTransition('cancelled', 'pending')).toThrow(/Transition invalide/);
    });

    it('in_progress -> pending lance une erreur', () => {
      expect(() => assertMissionTransition('in_progress', 'pending')).toThrow(/Transition invalide/);
    });
  });
});

// ─── Urgences ───────────────────────────────────────────────────────────────

describe('Machine a etats des urgences', () => {

  describe('isValidEmergencyTransition — transitions valides', () => {
    for (const [from, toList] of Object.entries(EMERGENCY_TRANSITIONS)) {
      for (const to of toList) {
        it(`${from} -> ${to} est valide`, () => {
          expect(isValidEmergencyTransition(from as EmergencyStatus, to as EmergencyStatus)).toBe(true);
        });
      }
    }
  });

  describe('isValidEmergencyTransition — etat terminal', () => {
    it('completed ne peut aller nulle part', () => {
      for (const target of ALL_EMERGENCY_STATUSES) {
        expect(isValidEmergencyTransition('completed', target)).toBe(false);
      }
    });
  });

  describe('isValidEmergencyTransition — transitions invalides', () => {
    it('bids_open ne peut pas aller directement a in_progress', () => {
      expect(isValidEmergencyTransition('bids_open', 'in_progress')).toBe(false);
    });

    it('in_progress ne peut pas revenir a bids_open', () => {
      expect(isValidEmergencyTransition('in_progress', 'bids_open')).toBe(false);
    });

    it('completed ne peut pas revenir a in_progress', () => {
      expect(isValidEmergencyTransition('completed', 'in_progress')).toBe(false);
    });
  });

  describe('assertEmergencyTransition — ne lance pas sur transition valide', () => {
    it('bids_open -> bid_accepted ne lance pas', () => {
      expect(() => assertEmergencyTransition('bids_open', 'bid_accepted')).not.toThrow();
    });
  });

  describe('assertEmergencyTransition — lance sur transition invalide', () => {
    it('completed -> bids_open lance une erreur descriptive', () => {
      expect(() => assertEmergencyTransition('completed', 'bids_open')).toThrow(
        'Transition invalide : impossible de passer de "completed" à "bids_open".'
      );
    });
  });
});
