# Audit des parcours Altio — 8 octobre 2026

**Décision : ne pas ouvrir les paiements de production à ce stade.** Après accord explicite, les corrections serveur ont été déployées le 8 octobre. La version TestFlight 1.0.0 (17) a été compilée et transmise à Apple avec succès ; la version 16 ne contient pas les corrections de cet audit. Voir le suivi de livraison ci-dessous.

## Livraison autorisée — 8 octobre

- Comparaison des quatre fonctions distantes avec les versions corrigées avant déploiement ; sauvegardes dans `/tmp/altio-deploy-oct8/remote`.
- Configuration distante vérifiée par un diagnostic authentifié sans mutation : Stripe en mode **test**. Configuration légale incomplète, premier champ manquant : `ALTIO_COMPANY_NAME`. Aucune identité inventée ni aucun secret retourné.
- Migration `lifecycle_invoice_notification_reliability` appliquée : triggers corrigés, unicité des factures par étape, notifications dédupliquées et traduites avant envoi, publication Realtime des étapes et factures.
- Fonctions actives : `generate-invoice` v33, `stripe-webhook` v18, `emergency-completion` v2, `process-completion-steps` v2. Le worker propose un contrôle de configuration en lecture seule, protégé par son secret existant.
- 134 tests serveur repassés après déploiement ; aucune modification des paiements live.
- Nouveau build : `953a7091-3c9c-4815-ba07-c6ce498a1c21`, version 1.0.0 (17), profil testflight. Soumission automatique : `8018f516-b139-4f1b-bab8-fd93ac30763a`.
- Conseillers Supabase relus après migration : alertes historiques toujours présentes, dont trois vues SECURITY DEFINER et dix-neuf fonctions à chemin de recherche variable. Aucun feu vert global de sécurité.
- Reprise automatique confirmée à 09:56:04 UTC : mission `371aef09-ee25-4fc1-8c61-d212d2dd4d5c` passée de `on_site` à `completed`, étape `1539ad9f-21b2-4fdd-bace-51f659f606e6` passée de `processing` à `paid`. Le worker vérifie le PaymentIntent existant ; aucun nouveau PaymentIntent créé par cette reprise. Le lancement manuel supplémentaire a expiré au contrôle automatique ; il n'a pas été nécessaire, le traitement programmé a abouti.
- Factures toujours absentes : `invoiced_at=null`, erreur de génération enregistrée et reprise différée. La configuration légale distante est incomplète ; les informations officielles ont été demandées. Ne pas annoncer la facturation comme fonctionnelle de bout en bout.
- Quatre notifications distinctes enregistrées à la clôture (paiement et fin d'intervention, une de chaque par rôle), chacune une seule fois. Texte « plomberie » confirmé. La réception physique sur téléphone reste à contrôler.
- Trois tests PostgreSQL repassés : tous réussis.
- Compilation iOS 17 terminée à 09:59:12 UTC ; soumission Apple `FINISHED` à 09:59:26 UTC, sans erreur. La disponibilité dans l'application TestFlight dépend ensuite du traitement Apple.
- Contrôle App Store Connect final : build **1.0.0 (17)** `VALID`, `IN_BETA_TESTING` pour les testeurs internes. Disponible dans TestFlight ; état externe `READY_FOR_BETA_SUBMISSION`, aucune ouverture aux testeurs externes effectuée.

## Preuves et causes

### Déblocage des factures sans médiateur — 8 octobre, 12:29 UTC

Après demande explicite de l'utilisateur, l'émission des factures ne dépend plus de la configuration du médiateur. L'identité, le régime de TVA, le mandat et le paiement confirmé restent contrôlés. Aucun médiateur n'est affiché si ses coordonnées ne sont pas complètes. Le contrôle général de préparation au lancement conserve l'exigence de médiation ; le responsable du service client n'est pas présenté comme médiateur.

Déploiements : `generate-invoice` v36 et `process-completion-steps` v5. Tests serveur : 136 réussis, dont génération des frais et commissions sans TVA ni médiateur et refus lorsque l'identité requise manque. Diagnostic serveur : Stripe test, `invoiceConfigured=true`, médiation toujours absente.

La reprise de facturation de l'étape payée `1539ad9f-21b2-4fdd-bace-51f659f606e6` a abouti à 12:29:05 UTC : trois factures avec documents enregistrés, erreur et délai de reprise effacés. Diagnostic : 75 € TTC (62,50 € HT, TVA prestataire 20 % selon son profil) ; frais propriétaire : 7,50 € sans TVA ; commission prestataire : 7,50 € sans TVA. La franchise d'Altio n'est pas appliquée au prestataire indépendant. Aucun nouveau paiement créé pour cette génération. La correction est serveur et ne nécessite pas un nouveau TestFlight.

### Identité complétée depuis la source officielle

Le 8 octobre, l'utilisateur a désigné [la fiche Annuaire des Entreprises de Manon Freuchet (Freuchet Services)](https://annuaire-entreprises.data.gouv.fr/entreprise/manon-freuchet-freuchet-services-999304736) comme identité de l'exploitant. Six informations ont été enregistrées sur le serveur et leurs empreintes vérifiées : nom, forme entrepreneur individuel (EI), SIREN 999304736, SIRET 99930473600013, adresse 61 chemin de la Vieille Ranche, 74110 Montriond, France, et immatriculation RNE sous le numéro 999 304 736. Le champ historique `ALTIO_RCS` porte la mention RNE : aucun RCS n'a été inventé.

Les valeurs publiques sont également intégrées à la configuration de l'application pour un prochain build ; le build TestFlight 17 déjà livré ne change pas. TypeScript et contrôle des différences passent. La fiche indique « Pas de n° TVA valide », ce qui ne permet pas de renseigner le régime fiscal. Ni email ni médiateur ne figurent sur la page ; leur confirmation a été demandée. Aucun numéro de TVA calculé, aucune franchise présumée et aucune affiliation à un médiateur ajoutée.

### Médiateur CM2C — 8 octobre

L’exploitant a confirmé avoir souscrit auprès de CM2C. Les coordonnées officielles sont intégrées à la configuration de l’application et du serveur : **CM2C — Centre de la Médiation de la Consommation de Conciliateurs de Justice**, 49 rue de Ponthieu, 75008 Paris, [https://www.cm2c.net/](https://www.cm2c.net/). Les anciennes références au CMAP et à la plateforme européenne RLL/ODR fermée en 2025 ont été retirées. La convention CM2C doit être conservée dans le dossier juridique de l’entreprise.

Les trois valeurs serveur ont été enregistrées et leurs empreintes vérifiées. La configuration est intégrée aux mentions légales, aux CGV, à l’onglet Médiation et à l’écran Réclamation. L’export iOS, TypeScript, les 317 tests application, les 136 tests serveur et la vérification des différences passent. Les builds TestFlight 1.0.0 (18) et 1.0.0 (19) ont été validés par Apple et sont disponibles pour les testeurs internes ; le build 19 est la version à utiliser. Build EAS : `695b073a-1d3b-40f7-9cd1-73932512b7e6`. Soumission : `6d98bcf7-5cad-4540-9956-f16f005666be`.

Les lectures du serveur `vtybccqqbyjbmhkpliyn` ont confirmé une étape de diagnostic de plomberie déclarée le 7 octobre, approuvée le 8 octobre à 08:55 UTC, montant autorisé 82,50 €, `finish_emergency=true`, toujours `processing`, mission `on_site`, sans facture. Les journaux montrent des échecs de rapprochement de `payment_intent.succeeded`.

La fonction de règlement utilise un `search_path` vide. Le trigger historique `notify_emergency_status_change` utilise `users`, `properties` et `_send_push` sans qualifier leur schéma. La clôture appelle ce trigger et toute la transaction PostgreSQL échoue, même après le succès Stripe. Le nouveau test PostgreSQL reproduit `relation "users" does not exist` avec la définition distante puis démontre la clôture avec la migration corrective. Les tests précédents remplaçaient ce trigger par une simulation et ne détectaient pas cette interaction.

Le webhook du parcours `completionFlow=v1` ne générait aucune facture par étape. Cette limite était déjà notée dans le compte rendu du 7 octobre. L’index historique interdisait plusieurs factures du même type pour une intervention, donc empêchait aussi une facturation correcte diagnostic/réparation.

Deux notifications de candidature pour la même intervention sont enregistrées le 8 octobre à 08:55:09.795 et 08:55:10.160 UTC : une issue du trigger, une autre du client. La notification de sélection est bien présente côté serveur. Sa réception effective sur le téléphone n’est pas établie.

Le centre de notifications conserve le texte traduit, mais le transport push pouvait envoyer le texte initial contenant `plumbing`. La traduction doit précéder à la fois l’enregistrement et l’envoi.

## Corrections préparées

| Parcours | Correction | Vérification |
| --- | --- | --- |
| Fin d’intervention | Qualification des tables et fonctions des triggers ; récupération de l’état actualisé après approbation ; erreurs de rapprochement visibles dans les journaux | PostgreSQL réel en mémoire, ancien blocage reproduit puis résolu |
| Paiement | Une mission classique `validated` demeure à régler tant que Stripe ne l’a pas confirmée ; un devis déjà accepté ne redemande pas son paiement avant la fin des travaux | Tests de classement et d’actions propriétaire/prestataire |
| Factures par étape | Facture diagnostic ou réparation, frais propriétaire et commission prestataire liés au paiement exact ; contrôle Stripe et des participants ; TVA du devis conservée | Six générations complètes dans un environnement simulé, montants et destinataires vérifiés |
| Reprise de facturation | Déclenchement par webhook et reprise par le worker des étapes payées sans documents ; délai entre reprises ; aucune nouvelle capture pour régénérer un document | Tests de panne partielle, génération complète, refus d’étapes non payées |
| Concurrence factures | Unicité `(completion_step_id, invoice_type)` ; traitement d’une insertion concurrente ; anciennes factures conservées | Test PostgreSQL de doublon et coexistence avec l’historique |
| Numérotation | Échec explicite si la séquence de facturation n’est pas disponible ; suppression du remplacement silencieux par un horodatage | Génération de documents avec séquence simulée |
| Consultation factures | Actualisation au retour sur la page et après un événement ; erreur de chargement visible ; accès aux factures depuis l’étape payée | TypeScript, tests d’API et compilation iOS |
| Accueil propriétaire | Une fin déclarée ou un paiement en traitement ne figure plus dans « Créneau à confirmer » ; suivi distinct | Tests de statuts avec et sans date |
| Accueil prestataire | Trois encarts permanents : missions en cours, validation/paiement, missions disponibles ; compteurs et états vides distincts ; rafraîchissement pendant la consultation | TypeScript et compilation iOS ; contrôle tactile sur téléphone restant |
| Notifications | Un seul circuit serveur pour les demandes client ; suppression du second envoi des candidatures urgentes et devis ; français avant transport ; verrou anti-rejeu et clé d’événement pour candidatures/messages | PostgreSQL : deux candidats distincts conservés, rejeu ignoré, charge utile push en français |
| Synchronisation | Invalidation des listes unifiées lors d’une urgence ; abonnement aux étapes de fin et factures ; publication Realtime ajoutée dans la migration | Vérification des publications distantes et test de migration local |
| Navigation après paiement | Fenêtre d’avis fermable et non réouverte automatiquement à chaque chargement ; favori conservé comme action facultative après clôture | Relecture du parcours et compilation |
| Déconnexion | État de chargement, prévention des doubles appuis et erreur affichée ; aucune promesse de résolution d’un problème réseau non reproduit | Compilation ; durée réelle à mesurer sur l’appareil |

## Vérifications réalisées

- Suite Jest complète de l’application : 317 tests passent (21 suites). Les tests appelés « e2e » dans ce dépôt utilisent des services simulés ; ils ne constituent pas une recette sur téléphone.
- 134 tests des fonctions serveur : paiements, montants, partage Connect, signatures des webhooks, contrôles d’accès, factures, reprises, documents et notifications.
- 3 tests PostgreSQL en mémoire : fenêtre 24/48 h, contestations, droits, verrouillage, clôture, interaction avec le trigger réel, traduction du push et unicité des factures.
- 5 tests de protection du lancement : la production reste bloquée en présence d’une clé test ou de points de préparation non résolus.
- TypeScript, compilation/export iOS et vérification des différences sans erreur de mise en forme.
- Lecture serveur : 93 factures existantes ; aucun document sans chemin ; aucune mission déjà `paid` ou intervention déjà `completed` dépourvue de facture. Ce comptage ne couvre pas la mission bloquée `on_site` : il ne prouve donc pas l’absence de problème de facturation.
- Lecture des autorisations : factures lisibles par acheteur/vendeur ; fichiers privés lisibles par participants ; écriture des fichiers réservée au serveur.
- Deux réponses Expo récentes acceptaient l’envoi (`ticket.status=ok`). Aucun contrôle APNs ni réception physique effectué. Un ticket accepté ne prouve pas la livraison : [documentation Expo](https://docs.expo.dev/push-notifications/sending-notifications/).

## Points bloquants et limites

1. **Mission réelle et livraison des corrections.** La mission bloquée a été reprise sans nouveau paiement, clôturée et ses trois documents de facturation ont été générés. La recette complète des deux rôles sur appareils reste nécessaire avant l’ouverture des paiements en production.
2. **Configuration légale.** Identité d’exploitant, franchise en base de TVA, contact et médiateur CM2C sont renseignés. La prochaine version TestFlight doit être contrôlée pour vérifier leur affichage dans les mentions, la médiation, les réclamations et les nouveaux documents de facturation.
3. **Remboursements et avoirs.** Le webhook `charge.refunded` consigne un événement mais n’automatise pas les avoirs. La sélection historique des factures est trop large. Les remboursements partiels, la restitution des commissions et les contrepassations Connect ne sont pas certifiés par cet audit. Leur traitement doit être finalisé et testé avant production.
4. **Autorisations expirées.** L’étape passe en paiement à régulariser sans débit forcé, mais le parcours de réautorisation autonome n’est pas finalisé. Les missions classiques ménage ne suivent pas encore le même automatisme 24/48 h que les interventions.
5. **Notifications réelles.** Vérifier sélection, candidature, devis, arrivée, fin, rappel, paiement et message sur deux comptes et deux appareils, au premier plan, en arrière-plan et application fermée. La langue serveur est actuellement française ; aucune préférence utilisateur de langue n’est persistée pour permettre un routage serveur FR/EN individualisé. L’audit ne prouve pas la livraison des pushes signalés manquants.
6. **Sécurité avant lancement.** Les conseillers Supabase signalent des vues à privilèges élevés, des fonctions historiques à chemin de recherche variable et les protections Auth à compléter. La vue de statistiques admin contient un contrôle `is_admin()` ; les alertes ne sont pas toutes des fuites démontrées. La revue générale reste nécessaire : [conseillers Supabase](https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view).
7. **Facturation électronique.** Les documents produits sont du HTML imprimable et un XML séparé. Leur génération ne vaut pas certification PDF/A-3, Factur-X ou conformité fiscale globale.

## Ordre de livraison et recette

1. Confirmer l’environnement Stripe cible et les informations de facturation. Ne pas activer les paiements live.
2. Après approbation, comparer les versions distantes et les changements locaux existants avant de déployer ; le dépôt contient de nombreux changements antérieurs à cet audit.
3. Appliquer `20261008090320_lifecycle_invoice_notification_reliability.sql`, puis déployer les fonctions de facturation, validation, webhook et worker avec leurs dépendances.
4. Vérifier le paiement Stripe existant sans créer de nouveau paiement ; laisser le rapprochement idempotent clôturer la mission ; vérifier trois documents pour le diagnostic payé et leurs accès respectifs.
5. Compiler un nouveau TestFlight après la migration. La version 16 ne contient pas ces corrections et conserve notamment l’ancien second envoi client.
6. Réaliser la recette des deux rôles sur appareils : création → candidature → sélection → autorisation → arrivée → déclaration → validation → paiement → documents → historique. Refaire avec réparation, refus du devis, contestation, fermeture du paiement, réseau interrompu et reprise du webhook.
7. Lever les blocages de production uniquement sur preuves. Le statut de paiement doit être confirmé côté serveur : [documentation Stripe](https://docs.stripe.com/payments/payment-intents/verifying-status).
