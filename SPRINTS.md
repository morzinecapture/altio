# ALTIO — Plan de sprints vers la production
> Généré le 2026-03-17 après audit complet de la codebase
> Chaque sprint est conçu pour être traité dans une fenêtre Claude Code indépendante.
> Coller le bloc "Contexte" correspondant en début de session.

---

## SPRINT 1 — Stabilisation & Bugs critiques
**Durée estimée : 1-2 jours**

### Contexte à coller dans Claude Code
```
Projet : Altio — React Native / Expo Router / Supabase / TypeScript
Dossier frontend : /Users/certideal/Downloads/Altio/altio/frontend
Skill code-checker : /Users/certideal/Downloads/Altio/altio/.claude/skills/code-checker/SKILL.md

SPRINT 1 — Stabilisation. Tâches à réaliser dans l'ordre :

1. mission/[id].tsx lignes 302 et 393 : remplacer les 2 appels supabase.from('missions') directs
   par des fonctions dans src/api.ts (ex: completeOwnerVerification, rejectMission).

2. Supprimer le dossier legacy frontend/app/admin/ (3 fichiers : index.tsx, partners.tsx,
   partner-form.tsx). Le vrai admin est dans frontend/app/(admin)/. Vérifier que _layout.tsx
   ne référence plus l'ancien chemin.

3. frontend/app/_layout.tsx : la clé Stripe publishableKey est 'pk_test_placeholder'.
   La remplacer par process.env.EXPO_PUBLIC_STRIPE_KEY et ajouter cette variable dans
   frontend/.env (créer le fichier si absent) avec la vraie clé test.

4. frontend/src/theme.ts : dans STATUS_LABELS ajouter les entrées manquantes :
   cancelled: 'Annulée', refunded: 'Remboursée', rejected: 'Refusée'

5. frontend/app/(provider)/my-missions.tsx : dans le handler de paiement, setLoading(true)
   n'est jamais remis à false en cas d'erreur. Ajouter un try/finally.

Utilise le skill code-checker pour chaque fix : lire le fichier, identifier la cause racine,
appliquer le fix minimal, vérifier qu'il n'y a pas de régression.
```

### Checklist
- [ ] `mission/[id].tsx` : 0 appel `supabase.from` direct
- [ ] Dossier `app/admin/` supprimé
- [ ] Clé Stripe via `EXPO_PUBLIC_STRIPE_KEY`
- [ ] `STATUS_LABELS` complet (cancelled, refunded, rejected)
- [ ] `setLoading` corrigé dans `my-missions.tsx`

---

## SPRINT 2 — Gestion du compte (RGPD)
**Durée estimée : 2-3 jours**

### Contexte à coller dans Claude Code
```
Projet : Altio — React Native / Expo Router / Supabase / TypeScript
Dossier frontend : /Users/certideal/Downloads/Altio/altio/frontend
Supabase functions : /Users/certideal/Downloads/Altio/altio/supabase/functions/
Skill code-checker : /Users/certideal/Downloads/Altio/altio/.claude/skills/code-checker/SKILL.md

SPRINT 2 — Gestion du compte. Tâches :

1. SUPPRESSION DE COMPTE (obligation RGPD) :
   - Créer supabase/functions/delete-account/index.ts :
     * Vérifier que l'appelant est bien l'utilisateur connecté (JWT)
     * Supabase Auth Admin API : supabaseAdmin.auth.admin.deleteUser(userId)
     * Supprimer ou anonymiser les données (missions actives → annuler, photos → delete from storage)
     * Stripe : désactiver le Connect account si provider
     * Insérer dans audit_log : action 'delete_account'
   - Dans frontend/app/(owner)/profile.tsx et frontend/app/(provider)/profile.tsx :
     * Ajouter un bouton "Supprimer mon compte" dans la section Paramètres (zone rouge)
     * Modale de confirmation en 2 étapes : alerte + saisie du texte "SUPPRIMER" pour confirmer
     * Après suppression : supabase.auth.signOut() puis router.replace('/')

2. AUTHENTIFICATION EMAIL (alternative à Google) :
   - frontend/app/index.tsx : ajouter un second bouton "Continuer avec Email" sous le bouton Google
   - Créer frontend/app/auth/signup.tsx : formulaire email + mot de passe + confirmation
   - Créer frontend/app/auth/forgot-password.tsx : formulaire email → supabase.auth.resetPasswordForEmail()
   - Créer frontend/app/auth/reset-password.tsx : nouveau mot de passe (intercepte le deep link Supabase)
   - Dans frontend/app/_layout.tsx : ajouter les routes auth/signup, auth/forgot-password, auth/reset-password

Les patterns UI à respecter :
- Même style que index.tsx (SafeAreaView, COLORS.background, FONTS.h1, SHADOWS.float)
- Boutons : style googleButton de index.tsx mais backgroundColor COLORS.brandPrimary
- Inputs : style input de missions.tsx (backgroundColor COLORS.subtle, borderRadius RADIUS.md)
```

### Checklist
- [ ] Edge Function `delete-account` déployée
- [ ] Bouton suppression dans Profile owner + provider
- [ ] Confirmation 2 étapes fonctionnelle
- [ ] Inscription email/password
- [ ] Reset mot de passe (email + deep link)

---

## SPRINT 3 — Intégration calendriers (iCal + Google Calendar)
**Durée estimée : 3-4 jours**

### Contexte à coller dans Claude Code
```
Projet : Altio — React Native / Expo Router / Supabase / TypeScript
Dossier frontend : /Users/certideal/Downloads/Altio/altio/frontend
Supabase functions : /Users/certideal/Downloads/Altio/altio/supabase/functions/

SPRINT 3 — Intégrations calendriers. Deux sous-modules :

── MODULE A : iCal Airbnb & Booking (côté Owner) ──────────────────────────

Contexte : Airbnb et Booking.com exposent une URL iCal publique (.ics) par logement.
La fonction syncIcal(id) existe déjà dans frontend/src/api.ts mais n'est pas complète.

1. frontend/app/property/add.tsx et frontend/app/property/[id].tsx :
   - Ajouter un champ TextInput "URL iCal Airbnb" et "URL iCal Booking.com"
   - Stocker dans la colonne properties.ical_airbnb_url et properties.ical_booking_url
     (créer une migration Supabase si ces colonnes n'existent pas)
   - Bouton "Synchroniser maintenant" → appelle syncIcal(propertyId)

2. Créer supabase/functions/sync-ical/index.ts :
   - Reçoit { propertyId }
   - Fetch l'URL iCal stockée dans properties
   - Parse le .ics avec la lib ical.js (npm:ical.js pour Deno)
   - Pour chaque VEVENT : upsert dans la table reservations
     (external_id = UID du VEVENT, source = 'airbnb'|'booking', start_date, end_date, guest_name = SUMMARY)
   - Retourner le nombre de réservations importées

3. frontend/app/(owner)/planning.tsx (s'il existe) ou dashboard.tsx :
   - Afficher les réservations externes avec un badge "Airbnb" ou "Booking" coloré

── MODULE B : Google Calendar (côté Provider) ──────────────────────────────

Contexte : Les prestataires veulent voir leurs missions Altio dans Google Calendar.

1. Ajouter dans supabase migrations : users.google_calendar_token TEXT, users.google_calendar_refresh_token TEXT

2. frontend/app/(provider)/profile.tsx — section "Intégrations" :
   - Bouton "Connecter Google Calendar" (si pas de token) ou "Déconnecter" (si token présent)
   - Utiliser expo-auth-session avec Google provider :
     * scopes: ['https://www.googleapis.com/auth/calendar.events']
     * Stocker access_token + refresh_token dans Supabase users

3. Créer supabase/functions/sync-google-calendar/index.ts :
   - Reçoit { providerId, missionId } (appelé après acceptation d'une mission)
   - Fetch le token Google du provider dans users
   - Crée un event Google Calendar via API :
     POST https://www.googleapis.com/calendar/v3/calendars/primary/events
     { summary: 'Mission Altio — [type]', start: { dateTime }, end: { dateTime }, location: propertyAddress }
   - Stocker le google_event_id dans missions pour pouvoir le modifier/supprimer

4. Déclencher sync-google-calendar après :
   - Mission assignée (provider accepte)
   - Mission annulée (supprimer l'event GCal)

Les packages à installer si absents :
- expo-auth-session (probablement déjà installé pour Google OAuth login)
```

### Checklist
- [ ] Champ URL iCal dans property/add + property/[id]
- [ ] Edge Function `sync-ical` fonctionnelle
- [ ] Réservations Airbnb/Booking visibles dans le planning owner
- [ ] OAuth Google Calendar dans provider profile
- [ ] Edge Function `sync-google-calendar` crée des events après assignation
- [ ] Migration colonnes `ical_*_url` + `google_calendar_token`

---

## SPRINT 4 — Facturation électronique (réforme 2026)
**Durée estimée : 3-5 jours**

### Contexte à coller dans Claude Code
```
Projet : Altio — React Native / Expo Router / Supabase / TypeScript
Dossier frontend : /Users/certideal/Downloads/Altio/altio/frontend
Supabase functions : /Users/certideal/Downloads/Altio/altio/supabase/functions/
Skill admin-dashboard : /Users/certideal/Downloads/Altio/altio/.claude/skills/admin-dashboard/SKILL.md

SPRINT 4 — Facturation électronique (réforme France 2026/2027).

Contexte réglementaire :
- 1er sept 2026 : grandes entreprises doivent émettre ET recevoir des e-factures
- 1er sept 2027 : TOUTES les entreprises (PME, TPE, auto-entrepreneurs)
- Format : Factur-X (PDF + XML CII embarqué) ou PDF structuré avec mentions légales
- Altio est une plateforme B2B : prestataires (pros) ↔ propriétaires (pros ou particuliers)
- Flux 1 : Altio émet une facture de commission au prestataire (10% HT + TVA 20%)
- Flux 2 : le prestataire émet une facture de prestation au propriétaire (Altio peut générer)

TÂCHES :

1. COLLECTE DES DONNÉES FISCALES — Migrations Supabase :
   ALTER TABLE users ADD COLUMN IF NOT EXISTS siren TEXT;
   ALTER TABLE users ADD COLUMN IF NOT EXISTS vat_number TEXT;       -- FR + clé SIREN
   ALTER TABLE users ADD COLUMN IF NOT EXISTS company_name TEXT;
   ALTER TABLE users ADD COLUMN IF NOT EXISTS billing_address TEXT;
   ALTER TABLE users ADD COLUMN IF NOT EXISTS is_vat_exempt BOOLEAN DEFAULT false;
   CREATE SEQUENCE IF NOT EXISTS invoice_seq START 1;

2. COLLECTE DANS LES ONBOARDINGS :
   - frontend/app/onboarding-owner.tsx : ajouter étape "Infos de facturation"
     (Nom entreprise, SIREN, N° TVA intracommunautaire, Adresse de facturation)
   - frontend/app/onboarding-provider.tsx : même chose
   - Valider le format SIREN (9 chiffres) et TVA (FR + 11 caractères)

3. EDGE FUNCTION generate-invoice :
   Créer supabase/functions/generate-invoice/index.ts
   - Input : { missionId, invoiceType: 'commission'|'service' }
   - Fetch mission + owner + provider depuis Supabase
   - Générer numéro séquentiel : 'ALT-' + year + '-' + LPAD(nextval('invoice_seq'), 5, '0')
   - Construire le PDF avec @jsr/pdf-lib ou générer un HTML converti en PDF
   - Mentions légales obligatoires :
     * Numéro de facture unique et séquentiel
     * Date d'émission + date d'échéance (30 jours pour B2B)
     * Coordonnées complètes vendeur + acheteur avec SIREN
     * Détail des prestations : HT, taux TVA (20%), TVA, TTC
     * Mention "TVA non applicable, art. 293 B du CGI" si auto-entrepreneur
     * Conditions de règlement + pénalités de retard (art. L441-6 Code commerce)
   - Stocker dans Supabase Storage bucket 'invoices/{year}/{invoice_number}.pdf'
   - Insérer dans table invoices (à créer) : id, invoice_number, mission_id, type, amount_ht,
     amount_ttc, vat_rate, seller_id, buyer_id, pdf_url, stripe_pi_id, created_at
   - Déclencher après capture-payment réussie

4. TABLE invoices — Migration :
   CREATE TABLE invoices (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     invoice_number TEXT UNIQUE NOT NULL,
     mission_id UUID REFERENCES missions(id),
     invoice_type TEXT NOT NULL CHECK (invoice_type IN ('commission', 'service')),
     amount_ht DECIMAL(10,2) NOT NULL,
     amount_ttc DECIMAL(10,2) NOT NULL,
     vat_rate DECIMAL(5,2) DEFAULT 20.00,
     seller_id UUID REFERENCES users(id),
     buyer_id UUID REFERENCES users(id),
     pdf_url TEXT,
     stripe_pi_id TEXT,
     status TEXT DEFAULT 'issued' CHECK (status IN ('issued', 'sent', 'paid', 'cancelled')),
     created_at TIMESTAMPTZ DEFAULT NOW()
   );
   ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
   -- Owner voit ses factures, Provider voit les siennes, Admin voit tout

5. UI — Section "Mes Factures" :
   - frontend/app/(provider)/revenue.tsx : onglet "Factures" listant toutes ses factures avec
     bouton téléchargement PDF (expo-sharing ou expo-file-system + Linking.openURL)
   - frontend/app/(owner)/profile.tsx : section "Facturation" avec liste des factures reçues
   - frontend/app/(admin)/finances.tsx : liste complète + filtres + export CSV

Patterns API à suivre (src/api.ts) :
   export const getMyInvoices = async () => { ... }
   export const downloadInvoice = async (invoiceId: string) => { ... }
   export const getAdminInvoices = async (filters?) => { ... }
```

### Checklist
- [ ] Migration colonnes fiscales (siren, vat_number, company_name, billing_address)
- [ ] Migration table `invoices`
- [ ] Collecte SIREN/TVA dans onboarding owner + provider
- [ ] Edge Function `generate-invoice` déployée
- [ ] Déclenchement auto après `capture-payment`
- [ ] Section "Mes Factures" dans Revenue (provider) + Profile (owner)
- [ ] Section admin finances enrichie
- [ ] Téléchargement PDF fonctionnel sur device

---

## SPRINT 5 — Internationalisation (FR / EN)
**Durée estimée : 2-3 jours**

### Contexte à coller dans Claude Code
```
Projet : Altio — React Native / Expo Router / Supabase / TypeScript
Dossier frontend : /Users/certideal/Downloads/Altio/altio/frontend

SPRINT 5 — Internationalisation français / anglais.

Package à installer : npm install i18next react-i18next

ARCHITECTURE :
frontend/src/i18n/
  fr.ts       ← toutes les chaînes françaises existantes
  en.ts       ← traductions anglaises
  index.ts    ← configuration i18next

TÂCHES :

1. Créer frontend/src/i18n/index.ts :
   import i18n from 'i18next';
   import { initReactI18next } from 'react-i18next';
   import * as Localization from 'expo-localization';
   import fr from './fr';
   import en from './en';

   i18n.use(initReactI18next).init({
     resources: { fr: { translation: fr }, en: { translation: en } },
     lng: Localization.getLocales()[0]?.languageCode ?? 'fr',
     fallbackLng: 'fr',
     interpolation: { escapeValue: false },
   });
   export default i18n;

2. Extraire TOUTES les chaînes de texte affichées à l'utilisateur dans fr.ts, organisées
   par namespace :
   {
     common: { loading: 'Chargement...', error: 'Erreur', confirm: 'Confirmer', cancel: 'Annuler' },
     auth: { continue_google: 'Continuer avec Google', tagline: '...', ... },
     owner: { dashboard: { title: 'Tableau de bord', ... }, missions: { ... }, ... },
     provider: { ... },
     mission: { ... },
     emergency: { ... },
   }

3. Créer en.ts avec toutes les traductions anglaises correspondantes.

4. Dans frontend/app/_layout.tsx : importer i18n au démarrage (import '../src/i18n').

5. Remplacer TOUTES les chaînes hardcodées dans les écrans par useTranslation() :
   const { t } = useTranslation();
   <Text>{t('common.loading')}</Text>

   Priorité : index.tsx, dashboard (owner+provider), missions, my-missions, profile.

6. Toggle langue dans frontend/app/(owner)/profile.tsx et frontend/app/(provider)/profile.tsx :
   Section "Préférences" → Langue → boutons 🇫🇷 Français / 🇬🇧 English
   import i18n from '../../src/i18n';
   i18n.changeLanguage('en') / i18n.changeLanguage('fr')
   Persister le choix : await AsyncStorage.setItem('lang', lang)

7. Adapter les textes dans theme.ts :
   STATUS_LABELS, MISSION_TYPE_LABELS → les rendre dynamiques via t() ou les dupliquer en EN.

Package supplémentaire si absent : expo-localization
```

### Checklist
- [ ] `i18next` installé et configuré
- [ ] `fr.ts` contient toutes les chaînes (0 hardcoded dans les écrans core)
- [ ] `en.ts` traduit en anglais
- [ ] Toggle langue dans Profile owner + provider
- [ ] Langue persistée entre sessions (AsyncStorage)
- [ ] STATUS_LABELS / MISSION_TYPE_LABELS traduits

---

## SPRINT 6 — Pré-production & Sécurité
**Durée estimée : 2-3 jours**

### Contexte à coller dans Claude Code
```
Projet : Altio — React Native / Expo Router / Supabase / TypeScript
Dossier : /Users/certideal/Downloads/Altio/altio/

SPRINT 6 — Pré-production. Audit de sécurité, RGPD et configuration prod.

TÂCHES :

1. AUDIT RLS COMPLET — Pour chaque table Supabase, vérifier que :
   - Un owner ne peut voir que ses propres données
   - Un provider ne peut voir que ses missions assignées / ses candidatures
   - Aucune donnée n'est accessible sans authentification
   - Tables à auditer : users, missions, properties, reservations, emergencies,
     provider_profiles, messages, invoices, audit_log
   Documenter les trous de sécurité trouvés et les corriger.

2. VARIABLES D'ENVIRONNEMENT — Créer frontend/.env.production :
   EXPO_PUBLIC_SUPABASE_URL=
   EXPO_PUBLIC_SUPABASE_ANON_KEY=
   EXPO_PUBLIC_STRIPE_KEY=pk_live_...
   EXPO_PUBLIC_GOOGLE_CLIENT_ID=
   Vérifier que AUCUNE clé n'est hardcodée dans le code.

3. MENTIONS LÉGALES — Créer frontend/app/legal.tsx :
   - Conditions Générales d'Utilisation (CGU)
   - Politique de Confidentialité (RGPD)
   - Mentions légales (éditeur, hébergeur)
   - Lien dans index.tsx (sous le bouton Google) et dans les Profiles
   Obligatoire pour App Store et Play Store.

4. RATE LIMITING — Dans chaque Edge Function Supabase :
   Ajouter une vérification basique de rate limit via upstash/redis ou simple compteur en DB.

5. EAS BUILD — Vérifier frontend/eas.json :
   {
     "build": {
       "production": {
         "distribution": "store",
         "ios": { "resourceClass": "m-medium" },
         "android": { "buildType": "apk" }
       }
     }
   }
   Commande : eas build --platform all --profile production

6. MONITORING — Installer et configurer Sentry :
   npm install @sentry/react-native
   Wraper le root layout avec Sentry.wrap()
   Configurer DSN dans les variables d'environnement

7. NOTATION / AVIS — Créer le système de notation prestataire :
   - Table reviews (mission_id, owner_id, provider_id, rating INT 1-5, comment TEXT)
   - Déclencher la demande de notation après completeMission()
   - Afficher la note moyenne sur provider/[id].tsx
   - Mise à jour de provider_profiles.average_rating

8. DEEP LINKING — Vérifier frontend/app.json :
   scheme: "monrto" (ou le nom de l'app)
   Tester les redirections : monrto://mission/xxx, monrto://auth/reset-password
```

### Checklist
- [ ] Audit RLS : 0 fuite de données entre comptes
- [ ] 0 clé hardcodée dans le code
- [ ] Écran CGU / Politique de confidentialité
- [ ] Rate limiting sur les Edge Functions critiques
- [ ] EAS build production configuré
- [ ] Sentry intégré
- [ ] Système de notation fonctionnel
- [ ] Deep linking testé

---

## SPRINT 7 — Launch
**Durée estimée : 1-2 jours**

### Contexte à coller dans Claude Code
```
Projet : Altio — React Native / Expo Router / Supabase / TypeScript
Dossier : /Users/certideal/Downloads/Altio/altio/

SPRINT 7 — Soumission stores et mise en production.

TÂCHES :

1. SUPABASE PRODUCTION :
   - Créer un nouveau projet Supabase (hors free tier — Pro plan)
   - Appliquer toutes les migrations dans l'ordre :
     supabase db push --project-ref <prod-ref>
   - Configurer les Edge Functions en production
   - Configurer les webhooks Stripe vers les fonctions prod
   - Activer les backups quotidiens

2. STRIPE PRODUCTION :
   - Remplacer pk_test_ et sk_test_ par les clés live_
   - Vérifier la configuration du webhook Stripe (events: payment_intent.*)
   - Tester un paiement complet end-to-end avec une vraie carte

3. TESTFLIGHT (iOS) :
   - eas build --platform ios --profile production
   - eas submit --platform ios
   - Inviter les beta testeurs via App Store Connect

4. GOOGLE PLAY INTERNAL TESTING (Android) :
   - eas build --platform android --profile production
   - eas submit --platform android
   - Promouvoir vers Production après validation

5. CHECKLIST FINALE APP STORE :
   - Icône 1024x1024 sans transparence
   - Screenshots iPhone 6.9" et 6.5" (minimum)
   - Description en français ET anglais
   - Politique de confidentialité URL publique
   - Age rating : 4+
   - Catégorie : Business ou Productivity

6. OTA UPDATES (après lancement) :
   eas update --branch production --message "Fix critique"
   Pour les corrections urgentes sans re-soumission aux stores.
```

### Checklist
- [ ] Supabase production configuré
- [ ] Stripe live keys + webhook prod
- [ ] Build iOS soumis sur TestFlight
- [ ] Build Android soumis sur Play Internal Testing
- [ ] Screenshots + description stores prêts
- [ ] URL CGU/Politique de confidentialité publique
- [ ] Monitoring Sentry actif en production

---

## RÉCAP GLOBAL

| Sprint | Contenu | Durée | Priorité |
|--------|---------|-------|----------|
| S1 | Bugs critiques + stabilisation | 1-2j | 🔴 Maintenant |
| S2 | Suppression compte + Auth email | 2-3j | 🔴 Avant prod |
| S3 | iCal Airbnb/Booking + Google Calendar | 3-4j | 🟠 Haute |
| S4 | Facturation électronique 2026 | 3-5j | 🟠 Avant sept 2026 |
| S5 | Internationalisation FR/EN | 2-3j | 🟡 Selon marché |
| S6 | Sécurité + RGPD + Pré-prod | 2-3j | 🔴 Avant prod |
| S7 | Launch stores | 1-2j | — Final |

**Total estimé : 14-22 jours de développement**
