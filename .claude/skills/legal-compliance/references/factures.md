# Factures — Obligations légales Altio (2026)

## Les 3 factures par transaction Altio

### Facture 1 — Prestation (prestataire → propriétaire)
- Émise par Altio au nom du prestataire (via mandat de facturation)
- Montant : le tarif fixé par le prestataire (ex. 200 € HT)
- TVA : selon le statut du prestataire

### Facture 2 — Frais de service (Altio → propriétaire)
- Émise par Altio en son nom propre
- Objet : « Frais de mise en relation / service plateforme »
- Montant : 10% de la prestation HT + TVA 20%

### Facture 3 — Commission plateforme (Altio → prestataire)
- Émise par Altio en son nom propre
- Objet : « Commission de service plateforme »
- Montant : 10% de la prestation HT + TVA 20%
- Périodicité recommandée : récapitulatif mensuel

## Mentions obligatoires — Toute facture (art. L441-9 Code de commerce + art. 289 CGI)

### Identification de l'émetteur
- [ ] Dénomination sociale complète
- [ ] Forme juridique
- [ ] Adresse du siège social
- [ ] Numéro SIREN / SIRET
- [ ] Numéro RCS + ville du greffe
- [ ] Numéro de TVA intracommunautaire
- [ ] Capital social (si société)

### Identification du destinataire
- [ ] Nom ou dénomination sociale
- [ ] Adresse
- [ ] **NOUVEAU 2026** : Numéro SIREN du client (si entreprise, pour les factures B2B)

### Informations sur la facture
- [ ] Mention « FACTURE »
- [ ] Numéro unique, basé sur une séquence chronologique et continue (pas de trou ni doublon)
- [ ] Date d'émission
- [ ] Date de réalisation de la prestation (ou période pour les récapitulatifs)

### Détail de la prestation
- [ ] Dénomination précise de la prestation
- [ ] Quantité et prix unitaire HT
- [ ] Total HT par ligne
- [ ] Rabais, remises, ristournes éventuels
- [ ] **NOUVEAU 2026** : Catégorie de l'opération (livraison de biens / prestation de services / mixte)

### TVA
- [ ] Taux de TVA applicable
- [ ] Montant de la TVA
- [ ] Total TTC
- [ ] Si franchise en base : « TVA non applicable, art. 293 B du CGI »
- [ ] Si autoliquidation : mention « Autoliquidation »
- [ ] **NOUVEAU 2026** : Mention « Option pour le paiement de la TVA d'après les débits »
  (si le prestataire a opté pour cette option)

### Conditions de paiement
- [ ] Date d'échéance du paiement
- [ ] Conditions d'escompte (ou mention « Pas d'escompte pour paiement anticipé »)
- [ ] Taux des pénalités de retard (minimum : 3 fois le taux d'intérêt légal)
- [ ] Indemnité forfaitaire de recouvrement : 40 €

### Mentions additionnelles selon contexte
- [ ] **NOUVEAU 2026** : Adresse de livraison si différente de l'adresse du client
  (applicable si des biens/matériaux sont livrés)
- [ ] Si artisan : assurance professionnelle (nature, assureur, couverture géo)
- [ ] Si EI/auto-entrepreneur : mention « Entrepreneur individuel » ou « EI »
- [ ] Garantie légale de conformité si vente à un particulier

## Numérotation des factures

La numérotation doit être :
- **Chronologique** : chaque facture a un numéro supérieur à la précédente
- **Continue** : pas de trou dans la séquence
- **Unique** : un numéro ne peut être attribué qu'une seule fois

Format recommandé pour Altio :
- Factures propriétaire (F2) : `ALTIO-PROP-2026-0001`
- Factures prestataire (F3) : `ALTIO-PREST-2026-0001`
- Factures mandat (F1) : `MANDAT-[SIRET_PRESTA]-2026-0001`

Chaque série de factures peut avoir sa propre séquence, mais chaque séquence doit
être continue et chronologique.

## Facture d'avoir

En cas d'annulation partielle ou totale, une facture d'avoir doit être émise :
- Mention « AVOIR » clairement visible
- Référence de la facture initiale
- Montant HT de la correction
- TVA correspondante
- Motif de l'avoir

## Délais d'émission

- Facture de prestation (F1) : au plus tard à la fin du mois de réalisation
- Factures Altio (F2 et F3) : à l'émission du paiement ou en récapitulatif mensuel
- Factures récapitulatives : au plus tard le dernier jour du mois suivant

## Conservation

- **Durée** : 10 ans à compter de la clôture de l'exercice
- **Format** : garantir authenticité de l'origine, intégrité du contenu, lisibilité
- Avec l'e-invoicing : les plateformes agréées conservent une copie, mais
  l'entreprise reste responsable de sa propre conservation

## Sanctions

- Facture non conforme (mention manquante) : 15 € par mention, plafond 25% du montant
- Facture non émise : amende de 50% du montant de la transaction
- Récidive en infractions de facturation : jusqu'à 75 000 € (pers. physique) /
  375 000 € (société)
