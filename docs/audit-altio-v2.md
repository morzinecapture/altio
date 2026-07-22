# RE-AUDIT ALTIO — V2
> Date : 25 mars 2026 | Comparaison avec audit V1 du même jour
> Mode : Lecture seule — aucun fichier modifié

---

## NOTE GLOBALE : 5.5 / 10 (était 6.5 → baisse de 1 point)

⚠️ **Pourquoi la note baisse malgré des corrections ?** Les fixes de sécurité sont bons (CORS, validation), mais l'ajout de code sans typage a fait exploser les `any` (59 → 186), et les chantiers structurels (tests, refactoring, composants) n'ont pas été touchés.

---

## TABLEAU COMPARATIF COMPLET

| # | Problème | Avant | Après | Status |
|---|----------|-------|-------|--------|
| 1 | CORS `*` sur Edge Functions | 🔴 17 fonctions | ✅ Env-based via `cors.ts` partagé | ✅ CORRIGÉ |
| 2 | .env.production exposé | 🔴 Commité | ⚠️ .gitignore OK mais fichier encore présent | ⚠️ PARTIEL |
| 3 | Instances de `any` | 🟠 59 | 🔴 186 (+214%) | ❌ RÉGRESSÉ |
| 4 | Promises fire-and-forget | 🔴 ~8 | ⚠️ 1 restante (ligne 226 api.ts) | ⚠️ QUASI-CORRIGÉ |
| 5 | Tests automatisés | 🔴 0 tests | 🔴 0 tests | ❌ PAS TOUCHÉ |
| 6 | God Components >1000 lignes | 🟠 4 fichiers | 🟠 4 fichiers | ❌ PAS TOUCHÉ |
| 7 | api.ts monolithique | 🟠 3,313 lignes | 🟠 3,316 lignes | ❌ PAS TOUCHÉ |
| 8 | Validation inputs Edge Functions | 🔴 0/17 | ⚠️ 7/17 validées (validate.ts créé) | ⚠️ PARTIEL |
| 9 | Fuite d'erreurs internes | 🔴 Partout | ⚠️ Amélioré mais incohérent | ⚠️ PARTIEL |
| 10 | Auth implicit au lieu de PKCE | 🟠 Implicit partout | ⚠️ PKCE web, implicit natif | ⚠️ PARTIEL |
| 11 | Composants réutilisables | 🟡 3 composants | 🟡 3 composants | ❌ PAS TOUCHÉ |
| 12 | CI/CD | 🟡 Aucun | 🟡 Aucun | ❌ PAS TOUCHÉ |
| 13 | Dossier legacy admin/ | 🟡 Présent | ✅ Supprimé | ✅ CORRIGÉ |
| 14 | Strings hardcodées FR | 🟡 Hardcodé | ⚠️ i18n setup OK, migration partielle | ⚠️ PARTIEL |

---

## SCORES PAR DOMAINE

| Domaine | V1 | V2 | Évolution |
|---------|----|----|-----------|
| Sécurité (CORS, auth, env) | 4/10 | 6/10 | ⬆️ +2 |
| Qualité code (types, any) | 5/10 | 4/10 | ⬇️ -1 |
| Tests | 1/10 | 1/10 | — |
| Architecture (api.ts, composants) | 4/10 | 4/10 | — |
| Gestion erreurs | 3/10 | 5/10 | ⬆️ +2 |
| DevOps / CI | 2/10 | 2/10 | — |

---

## CE QUI A ÉTÉ BIEN FAIT ✅

1. **CORS centralisé** — Module `cors.ts` partagé, origin configurable par env. Excellent.
2. **Module de validation** — `validate.ts` avec assertString, assertUUID, assertPositiveInt. Utilisé sur les fonctions critiques (paiements, factures).
3. **Promises sécurisées** — Pattern `captureError()` appliqué sur 50+ appels. Plus de fail silencieux.
4. **Legacy nettoyé** — Dossier `app/admin/` supprimé.
5. **i18n bootstrappé** — i18next configuré, prêt pour la migration des strings.

---

## CE QUI DOIT ÊTRE CORRIGÉ EN PRIORITÉ 🔴

### Priorité 1 — Stopper la régression des `any` (186 instances)
```
Contexte Claude Code :
Créer src/types/index.ts avec les interfaces : Mission, User, Emergency,
Quote, Invoice, Property, Reservation, Payment.
Puis chercher/remplacer tous les `: any` et `<any>` dans api.ts et les
Edge Functions. Objectif : <20 any restants.
```

### Priorité 2 — Écrire les premiers tests (couverture 0%)
```
Contexte Claude Code :
Installer vitest + @testing-library/react-native.
Écrire 20 tests minimum :
- 10 tests unitaires pour les fonctions de api.ts (paiements, missions)
- 5 tests pour les Edge Functions critiques (create-payment-intent, generate-invoice)
- 5 tests pour les composants auth (login, signup)
```

### Priorité 3 — Finir la validation des 10 Edge Functions restantes
```
Contexte Claude Code :
Utiliser le module validate.ts existant dans supabase/functions/_shared/.
Ajouter la validation dans : delete-account, export-user-data, sync-ical,
sync-google-calendar, connect-google-calendar, google-calendar-callback,
notify-admin-new-provider, annual-report, et les 2 restantes.
```

### Priorité 4 — Nettoyer .env.production de l'historique git
```bash
git rm --cached frontend/.env.production
git commit -m "Remove .env.production from tracking"
# Puis rotater toutes les clés dans Supabase + Stripe dashboards
```

---

## OBJECTIF POUR LE PROCHAIN AUDIT

| Métrique | Actuel | Objectif |
|----------|--------|----------|
| Instances `any` | 186 | < 20 |
| Tests automatisés | 0 | > 50 |
| Edge Functions validées | 7/17 | 17/17 |
| God Components >800 lignes | 4 | 0 |
| api.ts lignes | 3,316 | < 500 (découpé en services) |
| CI/CD | Non | GitHub Actions actif |

**Si ces objectifs sont atteints → Note estimée : 8/10**
