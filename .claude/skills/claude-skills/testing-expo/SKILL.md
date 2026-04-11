---
name: testing-expo
description: Stratégie de tests pour Altio avec Expo/React Native. Utilise cette skill dès qu'on parle de tests, TDD, Jest, testing-library, test unitaire, test d'intégration, mock, ou qu'on veut vérifier qu'une fonctionnalité marche correctement.
---

# Tests — Altio / Expo

## Stack de test
- **Jest** : runner de tests (inclus avec Expo)
- **React Native Testing Library** : tests de composants
- **MSW** (Mock Service Worker) : mock des appels API en test

## Ce qu'on teste (pragmatique)

### Priorité haute — toujours tester
- Logique métier : calcul de commission, validation de transitions de statut, parsing iCal
- Services : fonctions dans `services/` (missions, payments, matching)
- Hooks custom : `useMissions`, `useAuth`

### Priorité moyenne — tester si temps
- Composants avec logique : formulaires, filtres
- Navigation conditionnelle (owner vs provider)

### Priorité basse — tester si critique
- Composants purement visuels (cards, badges)
- Layouts statiques

## Exemple : test du parser iCal
```typescript
// __tests__/lib/ical.test.ts
import { parseICal } from '@/lib/ical'

const SAMPLE_ICAL = `BEGIN:VCALENDAR
BEGIN:VEVENT
DTSTART;VALUE=DATE:20260315
DTEND;VALUE=DATE:20260320
SUMMARY:Jean Dupont (ABC123)
UID:abc123@airbnb.com
END:VEVENT
END:VCALENDAR`

describe('parseICal', () => {
  it('parse une réservation Airbnb', () => {
    const result = parseICal(SAMPLE_ICAL)
    expect(result).toHaveLength(1)
    expect(result[0].guest_name).toBe('Jean Dupont')
    expect(result[0].source).toBe('airbnb')
    expect(result[0].checkout).toEqual(new Date(2026, 2, 20))
  })

  it('retourne un tableau vide si pas de VEVENT', () => {
    expect(parseICal('BEGIN:VCALENDAR\nEND:VCALENDAR')).toEqual([])
  })
})
```

## Exemple : test des transitions de mission
```typescript
// __tests__/services/missions.test.ts
import { isValidTransition } from '@/services/missions'

describe('transitions de mission', () => {
  it('broadcast → applied est valide', () => {
    expect(isValidTransition('broadcast', 'applied')).toBe(true)
  })

  it('broadcast → paid est invalide', () => {
    expect(isValidTransition('broadcast', 'paid')).toBe(false)
  })

  it('completed → paid est valide', () => {
    expect(isValidTransition('completed', 'paid')).toBe(true)
  })
})
```

## Commandes
```bash
# Lancer tous les tests
npx jest

# Lancer les tests d'un fichier
npx jest ical.test

# Mode watch
npx jest --watch

# Couverture
npx jest --coverage
```

## Règles
- Nommer les tests en français (describe/it en français)
- Un fichier de test par fichier source, dans `__tests__/` miroir de `src/`
- Mocker Supabase dans les tests de services (pas d'appels réels)
- Pas de snapshots sauf sur les composants UI critiques
- Tester les cas d'erreur autant que les cas de succès
