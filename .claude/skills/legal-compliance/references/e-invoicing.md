# E-Invoicing — Facturation électronique (2026)

## Calendrier de la réforme

### 1er septembre 2026
- **Réception** obligatoire de e-factures pour TOUTES les entreprises
- **Émission** obligatoire pour les grandes entreprises (GE) et ETI
- **E-reporting** obligatoire pour GE et ETI
- **4 nouvelles mentions** obligatoires sur toutes les factures B2B

### 1er septembre 2027
- **Émission** obligatoire pour TPE, PME et micro-entreprises
- **E-reporting** obligatoire pour tous

## Impact pour Altio

Altio est vraisemblablement une TPE/PME au démarrage. Cela implique :
- **Dès sept. 2026** : Altio doit pouvoir RECEVOIR des e-factures (de ses fournisseurs)
- **Dès sept. 2026** : les 4 nouvelles mentions doivent figurer sur toutes les factures
- **Dès sept. 2027** : Altio devra ÉMETTRE ses factures au format électronique

### Les factures Altio concernées
- **Factures 2 et 3** (émises par Altio) : devront transiter par une Plateforme Agréée
- **Facture 1** (mandat de facturation) : cas particulier — vérifier que la PA
  choisie supporte le mandat de facturation pour compte de tiers

## Plateforme Agréée (PA)

Chaque entreprise doit désigner une PA pour émettre et recevoir ses e-factures.

**Choix à faire pour Altio** :
- Sélectionner une PA immatriculée par l'administration fiscale
  (liste sur impots.gouv.fr, mise à jour régulièrement)
- Vérifier que la PA supporte le cas du mandat de facturation
- Stripe Connect se connecte à des partenaires conformes (Billit, Invopop)
  mais ne gère pas nativement l'e-invoicing français — il faut un partenaire PA dédié

**Critères de sélection de la PA** :
- Support du mandat de facturation
- Formats supportés (Factur-X, CII, UBL)
- Intégration API (pour automatiser depuis le backend Supabase)
- Volumétrie et tarification
- Support du e-reporting

## Formats acceptés

Les factures électroniques doivent être dans un format structuré :
- **Factur-X** : PDF avec données XML embarquées (le plus courant en France)
- **CII** (Cross Industry Invoice) : format XML pur
- **UBL** (Universal Business Language) : format XML pur

Un simple PDF envoyé par email ne sera plus une facture électronique valide
pour les transactions B2B.

## E-reporting

L'e-reporting concerne la transmission à l'administration fiscale des données de :
- **Transactions** : montants, dates, parties, nature des opérations
- **Paiements** : dates et montants des encaissements

**Pour Altio** : les données de paiement encaissées via Stripe Connect pour les
prestations de services devront être transmises.

Fréquence de l'e-reporting (selon régime TVA) :
- Régime réel normal : transmission bimensuelle
- Régime réel simplifié ou franchise : transmission trimestrielle

## 4 nouvelles mentions obligatoires (sept. 2026)

1. **Numéro SIREN du client** (si B2B)
2. **Adresse de livraison** (si différente de l'adresse de facturation)
3. **Catégorie de l'opération** : « Prestation de services », « Livraison de biens »
   ou « Mixte »
4. **Option TVA sur les débits** : mention si le prestataire a opté pour ce régime

## Sanctions e-invoicing

- Absence de PA désignée : 500 € + 1 000 € par trimestre de retard
- Facture non transmise au format électronique : 15 € par facture
- Manquement e-reporting : 250 € par manquement (avec plafonds annuels)

## Checklist de préparation Altio

- [ ] Identifier le statut d'Altio (TPE/PME → émission obligatoire sept. 2027)
- [ ] Choisir et contractualiser avec une Plateforme Agréée
- [ ] Vérifier le support du mandat de facturation par la PA
- [ ] Implémenter les 4 nouvelles mentions dans les templates de facture
- [ ] Mettre en place l'e-reporting des données de paiement
- [ ] Préparer la génération de factures au format Factur-X (ou CII/UBL)
- [ ] Tester l'intégration PA ↔ backend Supabase
- [ ] Former / documenter le processus pour l'expert-comptable
