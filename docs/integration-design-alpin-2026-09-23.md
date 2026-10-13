# Intégration de la direction alpine — 23 septembre 2026

La proposition V2 validée a été intégrée aux écrans React Native d’Altio. Les données et les opérations proviennent toujours des API existantes ; aucun changement de schéma, de commission ou de transition métier.

## Écrans et navigation

- Accueils propriétaire et prestataire : photographie alpine, typographie Jakarta, fond ivoire, cartes bleu nuit et hiérarchie centrée sur les actions utiles.
- Propriétaire : sélecteur de logement qui filtre réellement l’agenda et les priorités, semaine interactive, accès directs ménage/linge/maintenance, demandes urgentes et professionnels.
- Prestataire : disponibilité réelle, intervention prioritaire, suivi des candidatures, opportunités et revenus cumulés. Le raccourci « Tout voir » ouvre désormais les opportunités.
- Cinq onglets dans chaque espace : Accueil, Planning, Missions, Logements/Revenus, Compte. Les factures propriétaire restent accessibles depuis Compte, séparées des coordonnées de facturation.
- Missions prestataire : À découvrir, Candidatures, Mes missions. Les candidatures retirées et les demandes déjà attribuées ne sont pas présentées comme de nouvelles opportunités. Les invitations, interventions, suivis de paiement et historiques restent accessibles.
- Création propriétaire : besoin, organisation, récapitulatif. Conservation du brouillon au retour, présélection depuis l’accueil, contrôle de date et de montant, prise en charge de la virgule décimale, règles de photos conservées.
- Détail mission : prochaine étape, progression compacte, candidatures mieux séparées, consignes d’accès, annulation dans « Autres actions ». Les confirmations et appels métier existants sont conservés.
- Logements, plannings, comptes et revenus : en-têtes cohérents, photos réelles lorsqu’elles existent, prochaine intervention par logement, statuts harmonisés et descriptions qui ne recouvrent plus les montants.
- La fermeture séquencée de la modale prestataire est conservée : sur iOS, la navigation attend `onDismiss`. Une sélection de mission ordinaire ouvre son détail de mission.

## Vérifications

- TypeScript : vérification complète sans erreur.
- ESLint : aucune erreur sur les écrans modifiés. Avertissements préexistants dans certains écrans anciens (imports/variables inutilisés et dépendance d’effet).
- 202 tests existants réussis : parcours propriétaire/prestataire, API missions/urgences et machine à états.
- 5 nouveaux tests réussis : groupes de missions, candidatures d’urgence, candidatures obsolètes, historique/paiement et paramètres de navigation.
- Export du bundle iOS réussi.
- Navigation vérifiée dans le navigateur, aux formats 390 et 320 pixels : accueils, filtre de logement, opportunités, candidatures, missions actives, détail, formulaire avec retours, logements, planning, compte/factures et revenus.
- Correction des boutons imbriqués dans les cartes prestataire ; absence de boutons HTML imbriqués confirmée dans la liste.

L’aperçu navigateur utilise une copie temporaire des mêmes écrans et des données de démonstration, dans `/tmp/altio-design-review`. Aucun mock n’a été ajouté à l’application réelle.

La version native locale a été ouverte dans le simulateur iPhone. Elle affiche la connexion ; la vérification des parcours authentifiés sur iOS nécessite une session. Aucun paiement ni publication sur les stores n’a été effectué.
