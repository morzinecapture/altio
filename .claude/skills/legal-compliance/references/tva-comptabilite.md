# TVA & Comptabilité — Altio (2026)

## Régime TVA d'Altio

Altio est assujetti à la TVA au taux normal de 20% sur ses prestations de service
(mise en relation, commission plateforme).

Le CA d'Altio = **somme des commissions** (frais propriétaire + commissions prestataire),
pas le volume total des transactions.

## TVA sur les commissions Altio

### Frais de service propriétaire (Facture 2)
- Base : 10% du montant HT de la prestation
- TVA : 20%
- Exemple : prestation 200 € HT → frais 20 € HT + 4 € TVA = 24 € TTC

### Commission prestataire (Facture 3)
- Base : 10% du montant HT de la prestation
- TVA : 20%
- Toujours soumise à TVA 20%, que le prestataire soit assujetti ou non

## TVA du prestataire — 2 cas de figure

### Prestataire assujetti à la TVA (régime réel)
- Facture sa prestation avec TVA (généralement 20%, ou taux réduit si applicable)
- Récupère la TVA sur la commission Altio (déduction de TVA)
- Coût réel de la commission Altio : 10% net
- Sur la Facture 1 : TVA à 20% (ou taux réduit)

### Prestataire en franchise de base (auto-entrepreneur sous seuil)
- Ne facture PAS de TVA sur sa prestation
- Mention obligatoire : « TVA non applicable, art. 293 B du CGI »
- Supporte la TVA sur la commission Altio SANS pouvoir la récupérer
- Coût réel de la commission Altio : 12% (10% + 2% de TVA non récupérable)
- Sur la Facture 1 : pas de TVA

### Tableau comparatif (prestation 200 € HT)

| | Assujetti TVA | Franchise de base |
|---|---|---|
| Prix prestation HT | 200 € | 200 € |
| TVA prestation | 40 € (20%) | 0 € |
| Commission Altio HT | 20 € | 20 € |
| TVA sur commission | 4 € (récupérable) | 4 € (non récupérable) |
| Net perçu | 180 € HT | 180 € HT |
| Coût réel commission | 20 € (10%) | 24 € (12%) |

## TVA à taux réduit — Travaux immobiliers

### TVA à 10% (art. 279-0 bis du CGI)
Applicable aux travaux d'amélioration, transformation, aménagement et entretien
sur des logements achevés depuis plus de 2 ans (usage d'habitation).

### TVA à 5,5% (art. 278-0 bis A du CGI)
Applicable aux travaux d'amélioration de la performance énergétique (rénovation
énergétique) sur des logements achevés depuis plus de 2 ans.

### Conditions
- Le client (propriétaire) doit attester que le logement a plus de 2 ans et est
  à usage d'habitation
- Depuis février 2025 : les anciens CERFA sont supprimés, l'attestation se fait
  directement sur le devis ou la facture
- Le prestataire doit mentionner le taux appliqué et la base légale

### Implication Altio
- Le template de devis/facture doit permettre l'application de taux réduits
- L'attestation client doit être intégrée au flux (case à cocher + texte légal)
- La commission Altio reste à TVA 20% (c'est une prestation de service de plateforme,
  pas des travaux immobiliers)

## Autoliquidation de TVA

### Frais Stripe (prestataire irlandais)
Les frais Stripe sont facturés depuis l'Irlande (prestation de service intra-UE).
Altio doit appliquer le mécanisme d'**autoliquidation de TVA intracommunautaire** :
- Altio déclare la TVA en tant que redevable (auto-liquidation)
- La TVA est à la fois collectée et déductible (opération neutre)
- Mention sur la déclaration de TVA (lignes acquisition intracommunautaire)
- Facture Stripe sans TVA + mention « reverse charge » / autoliquidation

### Sous-traitance BTP
Si un prestataire Altio sous-traite à un autre professionnel pour des travaux BTP :
- Autoliquidation de TVA obligatoire sur la facture de sous-traitance
- Mention « Autoliquidation — art. 283-2 nonies du CGI »
- Altio n'est pas directement concerné (c'est entre le prestataire et son
  sous-traitant), mais le template de facturation doit le prévoir

## Comptabilité Altio — Principes

### Constatation du CA
- Le CA d'Altio = commissions brutes HT (avant déduction des frais Stripe)
- Les frais Stripe sont une **charge d'exploitation** (pas une réduction du CA)

### Flux Stripe Connect — Écriture type

Pour une mission à 200 € HT (264 € TTC payés par le propriétaire) :

**Encaissement** :
- Stripe encaisse 264 € TTC du propriétaire

**Répartition automatique Stripe** :
- 216 € TTC → compte connecté du prestataire (180 € HT + TVA si applicable)
- 48 € TTC → compte Altio (40 € HT de commissions + 8 € TVA)
- Frais Stripe (~2,9% + 0,25 €) déduits du montant Altio

**Comptabilité Altio** :
- Produit : 40 € HT (commission)
- TVA collectée : 8 €
- Charge : frais Stripe (~8 €)

### Rapprochement bancaire
- Les virements Stripe sont nets de frais → un rapprochement est nécessaire
  entre le CA brut (factures) et les encaissements nets (relevés bancaires)
- Utiliser un compte d'attente (compte 511) pour les fonds en transit Stripe

### Obligations déclaratives
- TVA : déclaration mensuelle ou trimestrielle selon régime
- IS / IR : selon forme juridique d'Altio
- CFE (Cotisation Foncière des Entreprises) : annuelle
- Récapitulatif annuel des sommes versées aux prestataires (art. 242 bis CGI)
  → avant le 31 janvier N+1

## Checklist comptable

- [ ] Plan comptable adapté aux flux marketplace (commission, transit, frais PSP)
- [ ] Séparation claire CA brut (commissions) vs volume de transactions
- [ ] Compte d'attente pour les fonds en transit Stripe
- [ ] Écriture d'autoliquidation TVA pour les frais Stripe (Irlande)
- [ ] Rapprochement bancaire mensuel Stripe ↔ comptabilité
- [ ] Préparation du récapitulatif annuel par prestataire
- [ ] Archivage 10 ans de toutes les factures émises
