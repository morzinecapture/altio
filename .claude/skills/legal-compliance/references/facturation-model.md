# Système de facturation Altio

## Contexte

Altio est une marketplace de services immobiliers. Statut juridique : **mandataire / intermédiaire**.
Le CA d'Altio = uniquement les commissions perçues, pas le volume des transactions.

Altio met en relation des propriétaires avec des prestataires (plombiers, électriciens, etc.).
Altio n'est PAS responsable de la qualité des prestations — le contrat est entre propriétaire et prestataire.
Altio gère uniquement la mise en relation, la facturation (via mandat) et le paiement (via Stripe Connect).

## Modèle de commission

- 10% côté propriétaire (frais de service)
- 10% côté prestataire (commission plateforme)
- Marge totale Altio : 20% sur chaque transaction

Le modèle est **opaque** : ni le propriétaire ni le prestataire ne connaît la commission de l'autre partie.
C'est légitime tant que les frais sont annoncés avant chaque transaction et détaillés sur les factures.

## Les 3 factures par transaction

Chaque mission terminée génère **3 factures distinctes**. Exemple pour une prestation de plomberie à 200 € HT :

### Facture 1 — Prestation (prestataire → propriétaire)
- **Émetteur apparent** : le prestataire (ses infos SIRET, TVA, assurance)
- **Émetteur réel** : Altio, via un **mandat de facturation** (art. 289-I-2 du CGI)
- **Destinataire** : le propriétaire
- **Montant** : 200 € HT (le tarif du prestataire)
- **TVA** : selon le statut du prestataire :
  - Assujetti : TVA 20% (ou taux réduit 10%/5,5% pour travaux sur logement > 2 ans)
  - Franchise de base (auto-entrepreneur) : « TVA non applicable, art. 293 B du CGI »
- **Mention obligatoire** : « Facture émise par Altio (SIREN xxx) au nom et pour le compte de [Prestataire] (SIREN yyy) en vertu d'un mandat de facturation »
- C'est Altio qui la génère automatiquement, mais juridiquement c'est la facture DU prestataire

### Facture 2 — Frais de service Altio (Altio → propriétaire)
- **Émetteur** : Altio (en son nom propre)
- **Destinataire** : le propriétaire
- **Objet** : « Frais de mise en relation et service plateforme Altio »
- **Montant** : 20 € HT + TVA 20% = 24 € TTC
- C'est une facture Altio classique, elle compte dans le CA d'Altio

### Facture 3 — Commission plateforme (Altio → prestataire)
- **Émetteur** : Altio (en son nom propre)
- **Destinataire** : le prestataire
- **Objet** : « Commission de service plateforme Altio »
- **Montant** : 20 € HT + TVA 20% = 24 € TTC
- **Périodicité** : facture récapitulative mensuelle recommandée (agrège toutes les commissions du mois)
- TVA toujours à 20%, que le prestataire soit assujetti ou non
- C'est une facture Altio classique, elle compte dans le CA d'Altio

### Résumé chiffré (prestation 200 € HT)

```
Propriétaire paie :     220 € HT / 264 € TTC (prestation + frais Altio)
Prestataire reçoit :    180 € HT / 216 € TTC (prestation - commission Altio)
Altio conserve :         40 € HT /  48 € TTC (frais proprio + commission presta)
  └── Moins frais Stripe (~2,9% + 0,25 €)
```

## Numérotation des factures — 3 séquences séparées

La numérotation doit être chronologique, continue (pas de trou) et unique.

**Factures Altio (F2 et F3)** : chacune a sa propre séquence classique.
- F2 : `ALTIO-PROP-2026-0001`, `...0002`, `...0003`
- F3 : `ALTIO-PREST-2026-0001`, `...0002`, `...0003`

**Factures mandat (F1)** : séquence isolée PAR PRESTATAIRE.
Puisque c'est juridiquement la facture du prestataire, la numérotation doit être continue par émetteur.
Chaque prestataire a son propre compteur :
- Plombier Dupont (SIRET 123) : `MAN-123-2026-0001`, `...0002`, `...0003`
- Électricien Martin (SIRET 456) : `MAN-456-2026-0001`, `...0002`

**Implémentation Supabase** : stocker le dernier numéro de facture par prestataire.
Incrémenter de façon atomique (transaction SQL ou RPC) pour éviter les doublons en cas de requêtes concurrentes.

## Flux de paiement — Stripe Connect

```
Propriétaire
    │ Paiement unique : 264 € TTC
    ▼
[Stripe Connect]
    ├─► Compte connecté prestataire : 216 € TTC (split automatique)
    ├─► Compte plateforme Altio : 48 € TTC (- frais Stripe)
    └─► Stripe : frais de transaction (~2,9% + 0,25 €)
```

- Le propriétaire paie en une seule opération dans l'app
- Stripe encaisse la totalité et fait le split automatiquement
- Pas besoin d'agrément ACPR car Stripe Connect est un PSP agréé

## Mandat de facturation

Le mandat autorise Altio à émettre la Facture 1 au nom du prestataire. Il est intégré aux CGU prestataire acceptées à l'inscription.

Le mandat doit préciser :
- Identité des parties
- Objet : émission de factures au nom et pour le compte du prestataire
- Obligations Altio : respect des mentions légales, transmission d'une copie, numérotation conforme
- Obligations prestataire : infos exactes et à jour, signaler tout changement de statut
- Le prestataire reste seul redevable de la TVA
- Procédure de contestation des factures
- Conditions de résiliation

**Acceptation des factures par le prestataire** : deux options possibles :
- Option A : validation explicite dans l'app avant envoi (plus sûr)
- Option B : acceptation tacite avec délai de contestation de 7 jours (plus fluide)

## Mentions obligatoires sur toute facture (2026)

### Mentions classiques
- Dénomination sociale, forme juridique, adresse siège, SIREN/SIRET, RCS, TVA intracom
- Numéro de facture unique (séquence chronologique continue)
- Date d'émission + date de la prestation
- Description détaillée, quantité, prix unitaire HT, total HT
- Taux et montant TVA, total TTC
- Conditions de paiement, escompte, pénalités de retard, indemnité forfaitaire 40 €

### 4 nouvelles mentions 2026
- Numéro SIREN du client (si B2B)
- Adresse de livraison (si différente)
- Catégorie de l'opération : « Prestation de services »
- Option TVA sur les débits (si applicable)

### Mentions spécifiques artisans (Facture 1)
- Assurance décennale : nom assureur, n° police, couverture géographique
- Qualifications professionnelles (RGE, Qualibat, etc.)
- Si EI/auto-entrepreneur : mention « Entrepreneur individuel » ou « EI »
- Si TVA réduite : attestation client intégrée (logement > 2 ans, usage habitation)

## TVA — Deux cas pour le prestataire

### Prestataire assujetti TVA
- Facture sa prestation avec TVA (20%, ou 10%/5,5% si travaux éligibles)
- Récupère la TVA sur la commission Altio → coût réel commission = 10%

### Prestataire franchise de base (auto-entrepreneur)
- Ne facture PAS de TVA → mention « TVA non applicable, art. 293 B du CGI »
- Supporte la TVA sur la commission Altio sans pouvoir la récupérer → coût réel = 12%

### Commission Altio
- Toujours TVA 20% (prestation de service plateforme), quel que soit le statut du prestataire

## Déclenchement de la génération des factures

La génération des 3 factures se déclenche quand :
1. La mission est marquée comme terminée par le prestataire
2. Le propriétaire confirme la bonne réalisation (ou après un délai sans contestation)
3. Le paiement Stripe est confirmé (charge succeeded)

Le backend doit alors :
1. Générer F1 (mandat) avec les infos du prestataire et incrémenter son compteur
2. Générer F2 (frais proprio) avec les infos Altio et incrémenter le compteur PROP
3. Ajouter la commission à l'agrégat mensuel du prestataire (pour F3 récapitulative)
4. Stocker les 3 factures en HTML + Factur-X XML dans Supabase Storage
5. Les rendre consultables dans l'app par chaque partie (propriétaire voit F1+F2, prestataire voit F1+F3)
6. Notifier le prestataire de la facture émise en son nom (pour contestation éventuelle)

## Conservation

- Toutes les factures : 10 ans (obligation comptable)
- Format : garantir lisibilité, intégrité, disponibilité sur toute la durée
- Stocker dans Supabase Storage avec métadonnées (type, mission_id, prestataire_id, date, montant)

## E-invoicing (à anticiper)

- Sept. 2026 : Altio doit pouvoir RECEVOIR des e-factures
- Sept. 2027 (si TPE/PME) : Altio devra ÉMETTRE au format électronique (Factur-X, CII ou UBL) via une Plateforme Agréée
- La PA choisie doit supporter le mandat de facturation
- Stripe Connect ne gère pas nativement l'e-invoicing français → besoin d'un partenaire PA dédié (Billit, Invopop, ou autre)

## Récapitulatif des objets de facturation

| Facture | Objet recommandé | TVA |
|---------|-------------------|-----|
| F1 | « Prestation de [type] — Mission n°[ID] » | Selon prestataire |
| F2 | « Frais de mise en relation et service plateforme Altio — Mission n°[ID] » | 20% |
| F3 | « Commission de service plateforme Altio — Période [mois/année] » | 20% |
