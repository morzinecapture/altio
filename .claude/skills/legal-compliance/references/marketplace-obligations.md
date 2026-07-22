# Obligations Marketplace — Altio (2026)

## Statut juridique d'Altio

Altio est un **opérateur de plateforme en ligne** au sens de l'article L.111-7 du
Code de la consommation (créé par la loi République numérique du 7 oct. 2016).

Altio agit comme **intermédiaire / mandataire** : mise en relation de propriétaires
(consommateurs ou professionnels) avec des prestataires (professionnels).

## Obligations de transparence et d'information

### Envers les consommateurs (propriétaires particuliers)

**Avant toute transaction** (art. L111-7 et D111-8 du Code de la consommation) :
- [ ] Qualité des personnes fournissant un service via la plateforme (professionnels)
- [ ] Type de service d'intermédiation offert par Altio
- [ ] Prix du service (commission / frais de mise en relation)
- [ ] Modalités de paiement
- [ ] Assurances et garanties proposées
- [ ] Modalités de règlement des litiges
- [ ] Coordonnées du médiateur de la consommation

**Informations précontractuelles** (art. L221-5 du Code de la consommation) :
- [ ] Caractéristiques essentielles du service
- [ ] Prix total TTC (incluant les frais de service Altio)
- [ ] Identité et coordonnées d'Altio
- [ ] Droit de rétractation (14 jours si contrat à distance)
- [ ] Garanties légales

### Envers les prestataires (professionnels) — Règlement P2B

Le règlement européen P2B (Platform-to-Business, 2019/1150) impose :
- [ ] CGU claires, accessibles, en langage compréhensible
- [ ] Notification 15 jours avant toute modification des CGU
- [ ] Motifs de suspension ou clôture de compte (documentés dans les CGU)
- [ ] Transparence sur les paramètres de classement des missions
- [ ] Transparence sur les traitements différenciés éventuels
- [ ] Accès aux données : informer quelles données sont collectées, comment elles
  sont utilisées, si elles sont partagées
- [ ] Système interne de traitement des réclamations
- [ ] Médiation identifiée dans les CGU

## DSA — Digital Services Act (applicable depuis février 2024)

Le DSA impose des obligations supplémentaires aux marketplaces B2C :

### Traçabilité des vendeurs/prestataires (art. 30 DSA)
- [ ] Collecter et vérifier AVANT la mise en ligne :
  - Nom, adresse, téléphone, email du prestataire
  - Copie de la pièce d'identité
  - Numéro d'inscription au registre professionnel (RCS/RNE)
  - Auto-certification du prestataire s'engageant à respecter le droit applicable
- [ ] Conserver ces informations pendant la durée de la relation + 6 mois après
- [ ] Faire des efforts raisonnables pour vérifier la fiabilité des informations

### Interface vendeur conforme
- [ ] Permettre au prestataire d'afficher son identité et ses coordonnées
- [ ] Permettre l'affichage des informations précontractuelles obligatoires
- [ ] Permettre l'affichage de son assurance professionnelle

### Exemption micro/petites entreprises
Les micro-entreprises (< 10 salariés, CA < 2 M€) et petites entreprises
(< 50 salariés, CA < 10 M€) sont exemptées de certaines obligations DSA
(transparence publicitaire, système de recommandation, etc.).
Altio au démarrage en bénéficie probablement, mais doit quand même respecter
les obligations de traçabilité des prestataires.

## Obligations fiscales de l'opérateur de plateforme

### Information aux utilisateurs (art. 242 bis CGI)
- [ ] Informer chaque prestataire, à chaque transaction, de ses obligations
  fiscales et sociales
- [ ] Renvoyer vers les sites des administrations compétentes (impots.gouv.fr,
  urssaf.fr)
- [ ] Sanction : 50 000 € d'amende en cas de défaut

### Déclaration annuelle à l'administration fiscale
- [ ] Transmettre un récapitulatif annuel des sommes perçues par chaque prestataire
- [ ] Date limite : 31 janvier N+1
- [ ] Seuil d'exemption : < 20 transactions ET < 3 000 € total par prestataire/an
- [ ] Sanction : 5% des sommes non déclarées

### KYC (Know Your Customer)
Via Stripe Connect, le KYC est géré par Stripe (PSP agréé) :
- [ ] Vérification d'identité des prestataires (obligation Stripe Connect)
- [ ] Vérification du statut professionnel
- [ ] Screening anti-blanchiment (AML)

## CGU / CGV — Structure recommandée pour Altio

### CGU Plateforme (pour tous les utilisateurs)
1. Objet et définitions
2. Inscription et conditions d'accès
3. Description du service d'intermédiation
4. Rôle d'Altio (mandataire, pas partie au contrat de prestation)
5. Obligations des utilisateurs
6. Propriété intellectuelle
7. Protection des données personnelles (renvoi politique RGPD)
8. Responsabilité et limitations
9. Modification des CGU (préavis 15 jours — P2B)
10. Loi applicable et juridiction
11. Médiation de la consommation

### CGU Prestataire (conditions spécifiques)
1. Conditions d'éligibilité (statut professionnel, assurances)
2. Processus d'inscription et vérification (DSA)
3. Mandat de facturation (clause détaillée — voir `mandat-facturation.md`)
4. Commission plateforme (montant, modalités, facturation)
5. Flux de paiement (Stripe Connect, délais de virement)
6. Obligations du prestataire (qualité, délais, assurance)
7. Système de notation et classement
8. Suspension et fermeture de compte (motifs + recours)
9. Réclamations internes

### CGV Propriétaire (frais de service)
1. Objet : frais de mise en relation
2. Prix : 10% HT de la prestation + TVA
3. Modalités de paiement
4. Droit de rétractation (si applicable)
5. Responsabilité d'Altio vs responsabilité du prestataire
6. Garanties et réclamations
7. Médiation

## RGPD — Obligations spécifiques

- [ ] **Politique de confidentialité** accessible, claire, complète
- [ ] **Base légale** documentée pour chaque traitement
- [ ] **Consentement marketing** : opt-in explicite (case non pré-cochée)
- [ ] **Cookies** : bandeau de consentement conforme (CNIL)
- [ ] **Droits des utilisateurs** : page/formulaire pour exercer les droits
  (accès, rectification, suppression, portabilité, opposition)
- [ ] **Registre des traitements** (art. 30 RGPD)
- [ ] **Sous-traitants** : contrats RGPD avec Supabase, Stripe, etc.
- [ ] **Notification de violation** : procédure sous 72h à la CNIL
- [ ] **Transferts hors UE** : vérifier les garanties (Stripe US, Supabase)

## Sanctions

- Défaut d'information consommateur : amendes DGCCRF variables
- Défaut d'information fiscale aux prestataires : 50 000 €
- Défaut de déclaration annuelle : 5% des sommes non déclarées
- Non-conformité RGPD : jusqu'à 4% du CA ou 20 M€
- Non-conformité DSA : amendes variables selon gravité
