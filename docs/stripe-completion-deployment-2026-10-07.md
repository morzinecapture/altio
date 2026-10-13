# Diagnostic : empreinte et validation sous 48 heures

Déployé sur Supabase `vtybccqqbyjbmhkpliyn`, le 7 octobre 2026.

## Règle autorisée

- Empreinte bancaire à l'acceptation du déplacement/diagnostic, sans débit immédiat.
- Le délai commence à la déclaration de fin par le prestataire, pas à l'empreinte.
- Notification à la déclaration, puis un unique rappel après 24 heures si en attente.
- Encaissement après validation du propriétaire ou après 48 heures sans contestation.
- Contestation ou annulation : suspension ; empreinte expirée : paiement à régulariser.
- Diagnostic et réparation sont des étapes distinctes.

## Déploiement

- `create-payment-intent` v27 : capture manuelle du diagnostic, métadonnée completionFlow et clé d'idempotence dédiée.
- `capture-payment` v28 : interdiction de contourner la validation des nouveaux paiements.
- `stripe-webhook` v17 : rapprochement des paiements par étape, sans traitement global historique.
- `emergency-completion` v1 et `process-completion-steps` v1 : déclaration, validation, contestation, traitement sécurisé.
- Table avec RLS et fonctions SQL réservées au serveur. Migration de clôture du diagnostic après refus de réparations.
- Traitement programmé chaque minute, actif ; secret dédié dans les secrets Edge et Vault, sans modifier les clés Stripe existantes.
- Les trois fonctions existantes ont été adaptées à partir de leur version distante, sans déployer les autres changements locaux.

## Vérifications

- 113 tests de fonctions, 25 tests frontend et 2 tests PostgreSQL en mémoire passent.
- Tests PostgreSQL : délai, rappel sans doublon, participants, contestation, verrouillage des captures et clôture après refus de réparations.
- Relecture distante confirme capture manuelle, marqueur de parcours et protections.
- Worker appelé à vide après vérification que la table ne contient aucune étape : HTTP 200, checked=0, failures=0.
- Exécution planifiée réussie ; appels non authentifiés rejetés.
- Aucune carte débitée pour ces vérifications. Aucun compte utilisateur créé ou supprimé.

## Limites à vérifier sur téléphone

Le parcours complet avec carte de test et la réception effective de la notification sur téléphone restent à vérifier. Les permissions de notification du téléphone restent nécessaires.
Les empreintes peuvent expirer : le traitement ne force pas un débit dans ce cas.
La génération des factures propres à chaque étape n'est pas ajoutée par ce déploiement : le webhook évite volontairement les anciennes factures globales.

Le contrôle Supabase signale également des alertes sur des objets préexistants, hors de cette correction, notamment des vues SECURITY DEFINER : [documentation de remédiation](https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view). Ne pas considérer cet audit ciblé comme une validation générale de sécurité du projet.
