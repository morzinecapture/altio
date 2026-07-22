# Audit UX Logique — Altio
**Date** : 2026-04-04
**Méthode** : Relecture code des écrans principaux, point de vue utilisateur (proprio + prestataire)

---

## Score global : 6.5/10

L'app est fonctionnelle et bien construite techniquement. Les vrais problèmes sont des **trous de logique utilisateur** — des moments où l'utilisateur ne sait pas quoi faire, voit des infos sans pouvoir agir, ou n'a pas de confirmation de ce qu'il vient de faire.

---

## 🔴 PROBLÈMES CRITIQUES (à corriger avant lancement)

### 1. Le prestataire peut s'inscrire sans spécialités ni disponibilités
**Écran** : `onboarding-provider.tsx`
**Problème** : L'onboarding permet de passer l'étape spécialités avec 0 sélection, et l'étape disponibilités avec un tableau vide. Résultat : un prestataire inscrit qui ne reçoit aucune mission (le matching zone+spécialité le filtre), sans comprendre pourquoi.
**Fix** : Bloquer le bouton "Suivant" si aucune spécialité sélectionnée. Afficher un message "Sélectionnez au moins 1 spécialité".

### 2. Les codes d'accès affichés en clair dans la liste missions prestataire
**Écran** : `app/(provider)/my-missions.tsx`
**Problème** : Le code d'accès au logement (digicode, boîte à clés) est visible directement sur chaque carte mission dans la liste. Quelqu'un qui regarde l'écran du prestataire voit tous les codes.
**Fix** : Masquer par défaut (●●●●), révéler au tap. Ou ne montrer le code que sur l'écran détail mission.

### 3. La suppression de propriété ne vérifie pas les dépendances
**Écran** : `app/property/[id].tsx`
**Problème** : Le proprio peut supprimer un bien qui a des missions actives ou des réservations futures. Les missions deviennent orphelines. Aucune alerte.
**Fix** : Vérifier s'il y a des missions non-terminées ou des réservations futures avant suppression. Si oui, bloquer et expliquer.

---

## 🟡 PROBLÈMES DE LOGIQUE UTILISATEUR (gênants)

### 4. Le proprio crée une mission sans feedback de confirmation
**Écran** : `app/(owner)/missions.tsx`
**Problème** : Le modal se ferme après création, mais aucune confirmation visuelle (toast, animation, résumé). Le proprio doit scroller dans la liste pour vérifier que la mission existe. Pire : s'il crée 5 missions ménage d'un coup depuis la fiche propriété, aucun récapitulatif.
**Fix** : Toast "Mission créée !" avec récap (type, date, tarif). Pour la création en lot depuis iCal, afficher un résumé avant validation.

### 5. Le compteur de candidatures est visible mais non-actionable depuis la liste
**Écran** : `app/(owner)/missions.tsx`
**Problème** : Le proprio voit "3 candidatures" sur la carte mission mais doit cliquer pour voir les prestataires. C'est une info frustrante : elle crée de l'urgence sans donner de moyen d'agir directement.
**Fix** : Soit afficher un mini-preview (avatar + nom du meilleur candidat), soit retirer le compteur de la liste et le garder uniquement sur le détail.

### 6. Le prestataire voit "Infos d'accès non renseignées" sans recours
**Écran** : `app/(provider)/my-missions.tsx`
**Problème** : Pour une mission assignée ou en cours, le prestataire voit "Infos d'accès non encore renseignées" mais ne peut rien faire depuis cet écran. Il ne peut pas contacter le proprio directement depuis la liste.
**Fix** : Ajouter un bouton "Demander au propriétaire" qui ouvre le chat. Ou masquer la section codes si elle est vide.

### 7. L'URL iCal n'est pas validée avant sauvegarde
**Écran** : `app/property/[id].tsx`
**Problème** : Le proprio colle une URL dans le champ iCal Airbnb/Booking. Aucune validation (format URL, accessibilité). L'erreur n'apparaît qu'au moment du sync, parfois des heures plus tard via le cron.
**Fix** : Valider le format URL au blur. Proposer un bouton "Tester la connexion" qui fait un sync immédiat et affiche le résultat.

### 8. Le flow d'urgence a trop d'états visuellement identiques
**Écran** : `app/emergency.tsx`
**Problème** : Les statuts `bid_accepted`, `provider_accepted`, `displacement_paid` utilisent la même icône. Le proprio ne sait pas si le prestataire est en route (déplacement payé) ou si c'est lui qui doit valider quelque chose (bid accepté mais déplacement pas encore payé).
**Fix** : Chaque état doit avoir un visuel distinct ET un message d'action clair. "Payez le déplacement pour confirmer" ≠ "Le prestataire est en chemin" ≠ "En attente de la réponse du prestataire".

### 9. L'onboarding proprio n'a pas de récap avant validation
**Écran** : `onboarding-owner.tsx`
**Problème** : Le proprio choisit son type, accepte les CGU, et c'est fini. Pas de résumé "Vous êtes inscrit en tant que [type], vous avez accepté les CGU du [date]". Il n'est pas sûr de ce qu'il a validé.
**Fix** : Ajouter un écran récapitulatif avant le bouton final, ou un toast de confirmation.

### 10. Pas de vérification qu'il y a des prestataires dans la zone avant création de mission
**Écran** : `app/(owner)/missions.tsx`
**Problème** : Le proprio crée 6 missions ménage pour ses 6 logements. Mais s'il n'y a aucun prestataire ménage à 50km, il va attendre des candidatures qui ne viendront jamais. Aucun avertissement.
**Fix** : Au moment de la création, faire un check rapide (count providers matching zone + specialty). Si 0 : "Aucun prestataire ménage n'est disponible dans votre zone pour le moment. Votre mission sera publiée et les prestataires seront notifiés dès qu'ils s'inscrivent."

### 11. Le parse d'adresse est fragile et silencieux
**Écran** : `app/property/[id].tsx`
**Problème** : L'adresse est parsée par split sur virgule et espace. "12 rue de la Paix, 75002 Paris" fonctionne, mais "Apt 3B, 12 rue de la Paix, 75002 Paris" casse le parsing silencieusement. Le proprio ne voit pas que son adresse est mal enregistrée.
**Fix** : Utiliser un service de geocoding/autocomplétion (Google Places, Mapbox) au lieu de parser manuellement. Ou au minimum, afficher un aperçu carte pour que le proprio vérifie la position.

### 12. Les boutons d'action urgence sont répétitifs et génériques
**Écran** : `app/(provider)/my-missions.tsx`
**Problème** : Pour 8 statuts différents d'urgence, le même bouton "Voir les détails" apparaît. Le prestataire doit cliquer à chaque fois pour savoir ce qu'il doit faire. C'est une perte de temps.
**Fix** : Adapter le label au contexte : "Envoyer mon offre", "Voir le devis", "Marquer mon arrivée", "Envoyer les photos", etc.

---

## 🟢 AMÉLIORATIONS COSMÉTIQUES

### 13. Le dark mode est activé mais pas implémenté
**Config** : `app.json` → `userInterfaceStyle: "automatic"`
**Problème** : L'app déclare supporter le dark mode mais n'utilise jamais `useColorScheme`. Sur un iPhone en dark mode, l'app risque d'être illisible (texte noir sur fond noir).
**Fix rapide** : Forcer `"light"` dans app.json. Fix long terme : implémenter le dark mode avec des tokens de couleur.

### 14. Le modal de notation peut s'afficher avant la synchro Stripe
**Écran** : `app/mission/[id].tsx`
**Problème** : Le modal demande une note dès que `status === 'paid'`. Mais le paiement est async (webhook Stripe). Race condition : le modal peut s'afficher alors que le paiement n'est pas encore confirmé côté Stripe.
**Fix** : Vérifier aussi que le payment_intent est `succeeded` avant d'afficher le modal.

### 15. Le bouton filtre du dashboard ne fait rien
**Écran** : `app/(owner)/dashboard.tsx` ligne 131
**Problème** : L'icône filtre (options-outline) est affichée à côté de la barre de recherche mais n'a aucun `onPress`. C'est un bouton mort.
**Fix** : Soit implémenter le filtre (par type, par statut, par date), soit retirer l'icône.

---

## Résumé par priorité

| Priorité | # | Thème |
|---|---|---|
| 🔴 Critique | 3 | Sécurité (codes), données invalides (onboarding), intégrité (suppression) |
| 🟡 Gênant | 9 | Feedback manquant, infos non-actionnables, états confus |
| 🟢 Cosmétique | 3 | Dark mode, race condition notation, bouton mort |

**Constat principal** : L'app souffre d'un manque de **feedback et de guidage utilisateur**. Les actions existent mais l'utilisateur ne sait pas toujours ce qui s'est passé après avoir agi, et ne sait pas toujours quoi faire quand il est dans un état intermédiaire.
