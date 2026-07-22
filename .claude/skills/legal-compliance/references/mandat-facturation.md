# Mandat de facturation — Altio

## Principe

Altio émet la Facture 1 (facture de prestation) **au nom et pour le compte du
prestataire**. C'est un mandat de facturation, encadré par l'article 289-I-2 du CGI.

Le prestataire **reste redevable de la TVA** sur sa prestation. Altio n'est que
le mandataire pour l'émission de la facture.

## Conditions de validité du mandat

Le mandat de facturation doit être formalisé par un accord préalable écrit entre
Altio (mandataire) et chaque prestataire (mandant). Cet accord est intégré aux
CGU acceptées par le prestataire lors de son inscription.

### Clauses obligatoires du mandat

- [ ] Identité complète des parties (Altio et prestataire)
- [ ] Objet du mandat : émission de factures au nom et pour le compte du prestataire
- [ ] Étendue du mandat : quelles factures sont couvertes (factures de prestation
  pour les missions réalisées via la plateforme)
- [ ] Obligations du mandataire :
  - Respect de toutes les mentions légales obligatoires
  - Transmission d'une copie de chaque facture au prestataire
  - Numérotation conforme à une séquence dédiée au prestataire
- [ ] Obligations du mandant (prestataire) :
  - Fournir des informations exactes et à jour (SIRET, TVA, assurance, etc.)
  - Informer Altio de tout changement de statut (passage à la TVA, cessation, etc.)
  - Accepter formellement chaque facture (ou procédure d'acceptation tacite avec délai)
- [ ] Responsabilité fiscale : le prestataire reste seul redevable de la TVA
- [ ] Conditions de résiliation du mandat
- [ ] Durée du mandat (indéterminée avec préavis de résiliation)
- [ ] Procédure en cas de contestation d'une facture

### Procédure d'acceptation des factures

Le prestataire doit pouvoir vérifier et accepter (ou contester) chaque facture
émise en son nom. Deux options :

**Option A — Acceptation explicite** :
Le prestataire valide chaque facture dans l'app avant envoi au propriétaire.
Plus lourd mais juridiquement plus sûr.

**Option B — Acceptation tacite avec délai** :
La facture est émise automatiquement. Le prestataire dispose de X jours (ex. 7 jours)
pour la contester. Passé ce délai, la facture est réputée acceptée.
Cette option nécessite une notification claire au prestataire à chaque émission.

## Numérotation spécifique

Chaque prestataire mandant doit avoir sa propre séquence de numérotation ou
une séquence globale avec un préfixe identifiant le mandant.

Format recommandé : `MANDAT-[SIRET_PRESTA_court]-2026-0001`

## Mentions spécifiques sur la facture mandatée (F1)

En plus des mentions obligatoires classiques, la facture émise par mandat doit
indiquer clairement :
- [ ] « Facture émise par [Altio — SIREN] au nom et pour le compte de
  [Prestataire — SIREN] en vertu d'un mandat de facturation »
- [ ] Les informations complètes du prestataire (c'est lui le « vendeur »)
- [ ] Les informations complètes du propriétaire (c'est lui « l'acheteur »)
- [ ] Le régime TVA du prestataire (assujetti : taux 20% ; franchise : mention 293 B)

## Impact e-invoicing

Avec la réforme de la facturation électronique (sept. 2026/2027), la PA choisie
par Altio doit **explicitement supporter le mandat de facturation** :
- La facture mandatée doit pouvoir être transmise via la PA d'Altio
- Le prestataire peut utiliser une PA différente pour ses factures hors Altio
- Vérifier comment la PA gère l'identité du mandant vs mandataire dans les flux

## Risques juridiques

- Si le mandat n'est pas formalisé : les factures émises par Altio sont
  juridiquement invalides → risque de rejet fiscal pour le prestataire
- Si le prestataire conteste une facture : Altio doit avoir une procédure de
  correction/annulation rapide
- En cas de contrôle fiscal du prestataire : celui-ci doit pouvoir présenter
  le mandat et accéder à toutes les factures émises en son nom

## Checklist d'implémentation

- [ ] Rédiger la clause de mandat dans les CGU prestataire (faire valider par un avocat)
- [ ] Stocker l'acceptation du mandat avec horodatage (preuve de consentement)
- [ ] Implémenter la génération automatique des factures F1 avec toutes les mentions
- [ ] Créer un écran de consultation des factures pour le prestataire
- [ ] Mettre en place la notification à chaque émission de facture
- [ ] Permettre la contestation dans un délai défini
- [ ] Archiver toutes les factures mandatées pendant 10 ans
