/**
 * Tests for API client utilities.
 *
 * Only pure utility functions are tested here — no Supabase calls.
 * We mock the re-exports that pull in Supabase/Sentry to avoid
 * import side-effects.
 */

// Mock modules that have side-effects or native dependencies
jest.mock('../../lib/supabase', () => ({ supabase: {} }));
jest.mock('../../sentry', () => ({ captureError: jest.fn() }));

import { checkError, unwrapJoin, haversineKm, getPropertyName } from '../_client';

// ─── checkError ─────────────────────────────────────────────────────────────

describe('checkError', () => {
  it('ne lance pas si error est null', () => {
    expect(() => checkError(null)).not.toThrow();
  });

  it('lance une erreur avec le message Supabase', () => {
    expect(() => checkError({ message: 'relation not found', details: '', hint: '', code: '42P01' }))
      .toThrow('relation not found');
  });

  it('lance un message par defaut si message est vide', () => {
    expect(() => checkError({ message: '', details: '', hint: '', code: '' }))
      .toThrow('Supabase query failed');
  });
});

// ─── unwrapJoin ─────────────────────────────────────────────────────────────

describe('unwrapJoin', () => {
  it('retourne le premier element d un tableau', () => {
    const result = unwrapJoin([{ id: '1' }, { id: '2' }]);
    expect(result).toEqual({ id: '1' });
  });

  it('retourne l objet tel quel si ce n est pas un tableau', () => {
    const obj = { id: '1', name: 'test' };
    expect(unwrapJoin(obj)).toBe(obj);
  });

  it('retourne undefined pour null', () => {
    expect(unwrapJoin(null)).toBeUndefined();
  });

  it('retourne undefined pour undefined', () => {
    expect(unwrapJoin(undefined)).toBeUndefined();
  });

  it('retourne undefined pour un tableau vide', () => {
    expect(unwrapJoin([])).toBeUndefined();
  });
});

// ─── getPropertyName ────────────────────────────────────────────────────────

describe('getPropertyName', () => {
  it('extrait le nom d un objet property', () => {
    expect(getPropertyName({ name: 'Villa Soleil' })).toBe('Villa Soleil');
  });

  it('extrait le nom d un tableau property (join Supabase)', () => {
    expect(getPropertyName([{ name: 'Appartement Paris' }])).toBe('Appartement Paris');
  });

  it('retourne une chaine vide si null', () => {
    expect(getPropertyName(null)).toBe('');
  });

  it('retourne une chaine vide si pas de champ name', () => {
    expect(getPropertyName({ address: '123 rue' })).toBe('');
  });
});

// ─── haversineKm ────────────────────────────────────────────────────────────

describe('haversineKm', () => {
  it('retourne 0 pour le meme point', () => {
    expect(haversineKm(48.8566, 2.3522, 48.8566, 2.3522)).toBe(0);
  });

  it('Paris-Lyon est environ 392 km', () => {
    // Paris: 48.8566, 2.3522 — Lyon: 45.7640, 4.8357
    const distance = haversineKm(48.8566, 2.3522, 45.7640, 4.8357);
    expect(distance).toBeGreaterThan(385);
    expect(distance).toBeLessThan(400);
  });

  it('Paris-Marseille est environ 660 km', () => {
    // Paris: 48.8566, 2.3522 — Marseille: 43.2965, 5.3698
    const distance = haversineKm(48.8566, 2.3522, 43.2965, 5.3698);
    expect(distance).toBeGreaterThan(650);
    expect(distance).toBeLessThan(670);
  });

  it('est symmetrique (A->B == B->A)', () => {
    const ab = haversineKm(48.8566, 2.3522, 45.7640, 4.8357);
    const ba = haversineKm(45.7640, 4.8357, 48.8566, 2.3522);
    expect(ab).toBeCloseTo(ba, 10);
  });
});
