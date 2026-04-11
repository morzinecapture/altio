# Memory

## Me
Maxime (maxime), Fondateur & développeur d'Altio. Travaille principalement avec Claude Code et Cowork. Utilise Google Cloud pour les clés API. Email : morzinecapture@gmail.com.

## People
| Who | Role |
|-----|------|
| **Maxime** | Fondateur, développeur principal d'Altio |

## Terms
| Term | Meaning |
|------|---------|
| Altio | Marketplace de services pour la gestion locative saisonnière (conciergerie, ménage, maintenance) |
| Owner | Propriétaire de logement saisonnier (donneurs d'ordre sur Altio) |
| Provider | Prestataire de services (ménage, conciergerie, etc.) côté Altio |
| RLS | Row Level Security — sécurité Supabase par utilisateur |
| Edge Function | Fonction serverless Supabase (Deno runtime) |
| iCal | Format calendrier (.ics) utilisé par Airbnb et Booking.com |
| Factur-X | Format de facturation électronique FR (PDF + XML CII) obligatoire sept 2026 |
| EAS | Expo Application Services — build & déploiement React Native |
| SIREN | Identifiant entreprise FR (9 chiffres) |
| CGU/CGV | Conditions Générales d'Utilisation / de Vente |

## Projects
| Name | What |
|------|------|
| **Altio** | App React Native / Expo Router / Supabase / TypeScript — marketplace B2B de services pour la location saisonnière. 7 sprints planifiés vers la production. |

## Tech Stack
- **Frontend** : React Native + Expo Router + TypeScript
- **Backend** : Supabase (PostgreSQL + Auth + Storage + Edge Functions)
- **Paiements** : Stripe Connect (prestataires) + Stripe Payments
- **Build** : EAS Build (iOS + Android)
- **Dev tools** : Claude Code (coding), Cowork (planning/pilotage), Google Cloud (API keys)

## Current Sprint Status
- Sprint 1 (Stabilisation) : En cours — bugs critiques à corriger
- Sprint 2 (RGPD) : À démarrer — suppression compte + auth email
- Deadline critique : Sprint 4 (Facturation) avant septembre 2026

## Preferences
- Langue de travail : Français
- Préfère les sessions Claude Code sprint par sprint avec contexte copié-collé
- Aime avoir des checklists claires par sprint

---

## Skills de référence (chargement automatique selon le contexte)

Avant de coder sur un sujet listé ci-dessous, **lis le fichier skill correspondant** pour appliquer les patterns, conventions et règles métier Altio.

| Sujet / Déclencheur | Fichier skill à lire |
|---|---|
| Auth, login, signup, session, token, mot de passe oublié, OAuth, protection de routes | `.claude/skills/claude-skills/supabase-auth/SKILL.md` |
| RLS, policies, sécurité données, données manquantes/invisibles, "array vide" | `.claude/skills/claude-skills/supabase-rls/SKILL.md` |
| Realtime, websocket, temps réel, notifications live, subscription | `.claude/skills/claude-skills/supabase-realtime/SKILL.md` |
| Migration, schéma, table, colonne, index, DDL, structure DB | `.claude/skills/claude-skills/database-migrations/SKILL.md` |
| Mission, statut, workflow, assignation, cycle de vie, transition d'état | `.claude/skills/claude-skills/mission-lifecycle/SKILL.md` |
| Matching prestataires, zones, favoris, notation, avis, attribution | `.claude/skills/claude-skills/provider-matching/SKILL.md` |
| Paiement, Stripe, Connect, commission, pré-autorisation, transfert | `.claude/skills/claude-skills/stripe-connect-payments/SKILL.md` |
| Notification, SMS, email, push, Twilio, Resend, alerte | `.claude/skills/claude-skills/notifications-sms-email/SKILL.md` |
| Calendrier, iCal, .ics, Airbnb, Booking, checkout, sync réservations | `.claude/skills/claude-skills/ical-sync-engine/SKILL.md` |
| Inscription, onboarding, première connexion, setup compte, KYC | `.claude/skills/claude-skills/onboarding-flow/SKILL.md` |
| Offline, cache, sync, connectivité, NetInfo, file d'attente | `.claude/skills/claude-skills/expo-offline-first/SKILL.md` |
| Composant, style, design, couleurs, bouton, card, UI, NativeWind | `.claude/skills/claude-skills/react-native-ui/SKILL.md` |
| Navigation, routing, tabs, stack, modale, deep link, Expo Router | `.claude/skills/claude-skills/expo-navigation/SKILL.md` |
| Structure projet, architecture, conventions, nommage fichiers | `.claude/skills/claude-skills/expo-conventions/SKILL.md` |
| Erreur, try/catch, toast, validation formulaire, messages utilisateur | `.claude/skills/claude-skills/error-handling-fr/SKILL.md` |
| Tests, Jest, testing-library, TDD, mock | `.claude/skills/claude-skills/testing-expo/SKILL.md` |
| Landing page, site web, SEO, référencement, Next.js marketing | `.claude/skills/claude-skills/landing-page-seo/SKILL.md` |
| Admin, back-office, dashboard, stats, KPI, modération, gestion users | `.claude/skills/SKILL-:admin-dashboard .claude:skills:md.md` |
| Code review, audit, bugs, qualité, lint, "ça marche pas" | `.claude/skills/SKILL-:code-checker .claude:skills:.md.md` |
| UX review, design review, audit UI, "c'est moche", cohérence visuelle | `.claude/skills/SKILL:ux-reviewer .claude:skills:.md.md` |
| Monitoring, santé plateforme, "ça plante", erreur prod, performance | `.claude/skills/SKILL-:platform-monitor .claude:skills:.md.md` |
| App Store, Play Store, publication, soumission, rejet, review, release, EAS Submit, TestFlight, privacy manifest, store compliance | `.claude/skills/store-reviewer/SKILL.md` |
| **⚠️ FLOW GUARDIAN** — statut, transition, bouton d'action, paiement, mission, urgence, devis, candidature, notification liée à un changement de statut, tout fichier listé dans le skill | `.claude/skills/flow-guardian/SKILL.md` |

**Règle** : quand tu travailles sur un sujet qui matche un déclencheur ci-dessus, lis le skill AVANT de coder. Si plusieurs skills sont pertinents, lis-les tous. Ne demande pas la permission, charge-les directement.

**Règle FLOW GUARDIAN** : le skill `flow-guardian` est PRIORITAIRE. Dès que tu modifies un statut, une transition, un bouton d'action, un flux de paiement, ou tout fichier listé dans ce skill, tu DOIS le lire et vérifier ta modification contre la checklist AVANT de coder. Si ta modification viole une règle du flow-guardian, tu NE DOIS PAS la faire et tu dois expliquer pourquoi.
