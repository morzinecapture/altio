# Altio — revue du design et de la navigation

Revue du 23 septembre 2026. Navigation dans le navigateur à 390 × 844 px, sur une copie isolée des composants actuels. Les comptes, missions et montants sont fictifs. Les appels au backend, notifications et paiements sont remplacés dans cette copie uniquement. Les cartes natives ne sont pas évaluées. Cette revue porte sur l’interface web en taille mobile ; elle ne remplace pas un essai natif sur iPhone.

Les écrans parcourus : accueils des deux rôles, logements et fiche logement, missions et détail mission propriétaire, création d’une mission, plannings des deux rôles, profils des deux rôles, missions et revenus prestataire. Aucune mission réelle créée ni modifiée. Aucun changement de design intégré à l’app.

## Direction recommandée

Conserver l’identité alpine, le bleu, les fonds clairs et les cartes arrondies. Réduire la place occupée par la décoration et les métadonnées pour montrer immédiatement la prochaine action utile. Harmoniser les composants entre les deux rôles, en adaptant les priorités métier.

### Trois options

1. **Retouches ciblées** : corriger les liens, agrandir les textes, uniformiser les statuts, réduire les ombres et les doublons. Peu de changement d’habitudes, mais les problèmes de structure persistent.
2. **Évolution de l’interface et des parcours — recommandée** : retouches ciblées, accueils plus compacts, cinq onglets propriétaire, centre des missions prestataire et formulaires mieux organisés. L’identité actuelle reste reconnaissable.
3. **Refonte complète** : nouveau langage visuel et nouvelle organisation générale. Plus de travail et de validation ; les constats actuels ne justifient pas de repartir de zéro.

## Priorité haute : navigation et compréhension

### Prestataire : les opportunités mènent au mauvais contenu

Observation : « Nouvelles opportunités → Voir tout » ouvre « Mes missions ». La mission disponible affichée sur l’accueil disparaît de cette liste.

Confirmation dans le code : le lien ouvre `/(provider)/my-missions`, dont la liste exclut les missions `pending`.

Proposition : une rubrique Missions avec trois vues « À découvrir », « Candidatures », « Mes missions ». Les liens depuis l’accueil doivent ouvrir la vue correspondante. Conserver les invitations, l’exécution et l’historique comme filtres contextuels.

### Propriétaire : alléger la barre du bas

Observation : six onglets, dont Factures et Profil ; les libellés sont petits. Le code impose 10 px et désactive l’adaptation de taille des libellés.

Proposition : Accueil, Planning, Missions, Logements, Compte. Factures reste directement accessible dans Compte et depuis les missions concernées. Une action « À payer » reste visible sur l’accueil lorsqu’elle est nécessaire. Côté prestataire, conserver Revenus en accès principal à la place de Logements.

### Réserver les couleurs et libellés à un sens stable

Observation : une mission confirmée apparaît avec des traitements différents selon l’accueil, la liste et le planning. Les libellés alternent entre « Prévue », « Prestataire confirmé », « Assigné » et « Accepté ». « À régler » apparaît aussi côté prestataire.

Proposition : vocabulaire stable pour le suivi, mais explications adaptées au rôle : « À payer » pour le propriétaire, « Paiement client en attente » pour le prestataire. Conserver les statuts métier existants ; modifier seulement leur présentation. Toujours accompagner les couleurs d’un libellé.

### Sélecteur de logement trompeur

Observation : la carte logement de l’accueil porte une flèche vers le bas, mais ouvre la page Logements au lieu d’un choix.

Proposition : soit un vrai filtre « Tous les logements / Chalet / Appartement » appliqué aux priorités et au planning, soit un lien nommé « Voir mes logements » avec une flèche vers la droite.

## Priorité haute : rendre les actions utiles visibles

### Accueils

Les images d’en-tête occupent 365 px côté propriétaire et 430 px côté prestataire dans le code. À 390 × 844 px, les opportunités prestataire se trouvent sous le premier écran ; les statistiques passent avant la mission du jour.

Proposition propriétaire : en-tête de 180–220 px environ, choix du logement, bloc « À faire » conditionnel (candidatures, devis, validation, paiement), prochaine intervention et demande de service. Garder un accès urgence identifiable et rapidement accessible.

Proposition prestataire : disponibilité compacte, prochaine mission avec horaire, accès/consignes/itinéraire, candidatures à suivre, puis nouvelles opportunités. Déplacer les statistiques détaillées vers Revenus ; préciser la période de chaque indicateur.

### Détail de mission

Observation : sur la mission confirmée examinée, « Annuler la mission » est un grand bouton rouge, visuellement plus fort que la discussion. La frise comporte six petits libellés. L’adresse apparaît deux fois.

Proposition : un résumé « statut + prochaine étape », une action principale liée à l’étape, des accès secondaires aux échanges et documents, et l’annulation dans « Autres actions ». Conserver l’historique détaillé et toutes les confirmations nécessaires. Afficher l’action principale en bas de l’écran si le contenu est long.

### Nouvelle mission

Observation : formulaire dans une fenêtre avec logement, type, mode, date, tarif, description et photos obligatoires ; le bouton final demande de défiler.

Proposition : trois étapes courtes « Logement et besoin », « Date et budget », « Récapitulatif ». Préremplir le logement depuis son contexte et le tarif lorsqu’il existe. Expliquer « Appel d’offres » par « Recevoir des propositions ». Préserver le brouillon lors d’un retour en arrière.

## Priorité moyenne : cohérence et confort

- **Plannings** : harmoniser les en-têtes et proposer Jour / Semaine / Mois dans les deux espaces, avec Aujourd’hui facilement accessible. Le planning propriétaire affiche deux confirmations successives que les ménages sont planifiés ; une seule suffit.
- **Cartes mission** : même ordre d’information : service et logement, date/heure, statut, prix, action. Remplacer les dates numériques par Aujourd’hui/Demain lorsque pertinent. Masquer les compteurs de candidatures à zéro lorsqu’ils n’aident plus à agir.
- **Profils** : les en-têtes et cartes d’identité propriétaire et prestataire diffèrent fortement. Utiliser le même cadre, puis grouper les réglages par Compte, Activité, Paiements, Assistance.
- **Revenus** : préciser la période et distinguer, lorsque les données le permettent, encaissé et en attente. Corriger les descriptions longues des missions récentes qui débordent sur les montants dans l’aperçu. Garder l’information fiscale accessible, sous une présentation plus compacte.
- **Lisibilité** : limiter les petits textes gris, augmenter les métadonnées importantes et les zones tactiles. Les cibles exactes et contrastes restent à mesurer sur l’interface native.
- **Notifications** : privilégier les informations persistantes dans l’accueil et les confirmations discrètes ; réserver les fenêtres bloquantes aux décisions qui les exigent. Garder les annonces de sélection consultables après fermeture.

## Ordre d’implémentation proposé

1. Liens des opportunités, libellés par rôle et sélecteur logement.
2. Accueils et barre de navigation propriétaire.
3. Carte mission partagée et détail avec prochaine étape.
4. Création guidée, plannings, profils et revenus.

Validation à prévoir : textes longs, aucun logement/aucune mission, plusieurs actions en attente, grandes tailles de texte, réseau lent, clavier ouvert, retour arrière et transitions de fenêtres sur iPhone. Les captures de cet aperçu ne permettent pas de conclure sur ces comportements natifs.
