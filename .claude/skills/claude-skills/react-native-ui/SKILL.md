---
name: react-native-ui
description: Composants UI et design system Altio — StyleSheet.create + src/theme.ts (PAS de NativeWind/Tailwind). Utilise cette skill dès qu'on crée un composant, qu'on parle de style, design, couleurs, typographie, boutons, cards, formulaires, états vides/chargement, ou interface utilisateur.
---

# Design System UI — Altio

> ⚠️ **Altio n'utilise PAS NativeWind ni Tailwind.** Aucun `className` dans le code.
> Tout le style passe par `StyleSheet.create` alimenté par les tokens de `src/theme.ts`.
> Si tu vois une doc qui parle de `className="bg-white rounded-xl"`, elle ne s'applique pas ici.

## Source de vérité : `frontend/src/theme.ts`

**Ne jamais écrire une couleur, un espacement ou un rayon en dur.** Toujours importer le token.

```tsx
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS, GRADIENT, STATUS_COLORS, STATUS_LABELS } from '../../src/theme';
```

### COLORS
| Groupe | Tokens |
|---|---|
| Fonds | `background` `#F1F5F9` · `paper` `#FFFFFF` · `subtle` `#E2E8F0` · `surfaceGlass` |
| Texte | `textPrimary` `#1E293B` · `textSecondary` `#64748B` · `textTertiary` `#94A3B8` · `textInverse` |
| Marque | `brandPrimary` `#2563EB` · `brandSecondary` `#3B82F6` · `brandAccent` `#1D4ED8` |
| Fonctionnel | `urgency` / `urgencySoft` · `success` / `successSoft` · `warning` / `warningSoft` · `info` / `infoSoft` |
| Accent | `coral` / `coralSoft` (CTA orange B2B) · `purple` / `purpleSoft` (**admin uniquement**) |
| Bordures | `border` `#CBD5E1` · `borderActive` `#94A3B8` |

Direction artistique : **Minimalism / Swiss Style + Trust & Authority**. Bleu professionnel pur,
pas de dérive violet, ombres neutres (Slate 900) — jamais d'ombre colorée sauf `SHADOWS.urgency`
et `SHADOWS.success` qui sont volontairement teintées.

### GRADIENT (avec `expo-linear-gradient`, utilisé dans ~15 écrans)
`header` · `brandButton` · `urgencyButton` · `successButton` · `warmBanner`

```tsx
<LinearGradient colors={GRADIENT.urgencyButton} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.fab}>
```

### SPACING (base 4)
`xs:4` `sm:8` `md:12` `lg:16` `xl:20` `xxl:24` `xxxl:32` `xxxxl:40`

### RADIUS
`sm:10` `md:14` `lg:20` `xl:24` `xxl:28` `full:999`
→ Cards = `RADIUS.xl` · Modales (coins haut) = `RADIUS.xxl` · Chips/badges = `RADIUS.full`

### SHADOWS
`card` (défaut) · `cardHover` · `float` (modales, FAB) · `urgency` · `success`

### FONTS — Plus Jakarta Sans
Chargée dans `app/_layout.tsx` via `useFonts` (`@expo-google-fonts/plus-jakarta-sans`).
`h1` 28/800 · `h2` 22/700 · `h3` 18/600 · `body` 15/400 · `bodySmall` 13/400 · `caption` 11/600 uppercase

```tsx
title: { ...FONTS.h1, color: COLORS.textPrimary },
```

## Pattern de fichier écran

`StyleSheet.create` en **bas** du fichier, constante nommée `styles` (convention respectée par 49
écrans sur 50 — ne pas introduire de `s = StyleSheet.create`).

```tsx
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  card: {
    backgroundColor: COLORS.paper,
    marginHorizontal: SPACING.xl,
    marginTop: SPACING.lg,
    padding: SPACING.lg,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.card,
  },
  chip: { paddingHorizontal: SPACING.md, paddingVertical: 6, borderRadius: RADIUS.full },
  chipText: { ...FONTS.caption, fontSize: 11 },
});
```

## Statuts — badges

**Ne jamais réécrire une table de statuts locale.** `STATUS_COLORS`, `STATUS_LABELS` et
`EMERGENCY_STATUS_LABELS` vivent dans `theme.ts` et sont partagés avec le flow des missions.

```tsx
<View style={[styles.chip, { backgroundColor: STATUS_COLORS[m.status]?.bg }]}>
  <Text style={[styles.chipText, { color: STATUS_COLORS[m.status]?.text }]}>
    {STATUS_LABELS[m.status]}
  </Text>
</View>
```

Ajouter un statut = l'ajouter dans `theme.ts` **et** vérifier le skill `flow-guardian` avant.

## États obligatoires par écran de liste

```tsx
if (isLoading) return <SafeAreaView style={styles.container} edges={['top']}><SkeletonList count={4} /></SafeAreaView>;
```

`src/components/Skeleton.tsx` exporte `SkeletonBox` · `SkeletonCard` · `SkeletonList` ·
`SkeletonDashboard` · `SkeletonProfile`. **Skeleton, pas `ActivityIndicator` nu** sur les listes
(l'`ActivityIndicator` reste acceptable pour un bouton en cours de soumission).

État vide via `ListEmptyComponent` — icône Ionicons + texte i18n :

```tsx
ListEmptyComponent={
  <View style={styles.empty}>
    <Ionicons name="clipboard-outline" size={50} color={COLORS.textTertiary} />
    <Text style={styles.emptyText}>{t('owner.missions.empty')}</Text>
  </View>
}
```

## Interaction & icônes
- **`TouchableOpacity`** partout (49 écrans). `Pressable` n'est utilisé nulle part — ne pas mélanger.
- Icônes : `Ionicons` de `@expo/vector-icons`, taille 16/18/20 en ligne, 50 pour les états vides.
- `testID` sur les écrans et actions clés pour les tests (`testID="owner-missions-screen"`).

## Textes — i18n
L'app est bilingue FR/EN (`react-i18next`, `src/i18n/`, fallback `fr`). Tout nouveau texte visible
passe par `const { t } = useTranslation()` et une clé ajoutée dans `src/i18n/fr.ts` **et** `en.ts`.
Les libellés métier (types de mission, services) passent par `src/utils/serviceLabels.ts`.

## Accessibilité
- Zones tactiles minimum 48×48px (les boutons ronds font `width/height: 48`).
- Contraste texte/fond minimum 4.5:1 — `textTertiary` réservé aux méta-infos, jamais au corps de texte.
- `accessibilityLabel` sur tous les boutons icône-seule.

## Ce qui n'est PAS disponible dans le projet
Vérifié dans `frontend/package.json` — ne pas écrire de code qui en dépend sans l'installer d'abord
et sans en parler à Maxime (le projet sort d'un conflit de build natif fmt/Stripe sous Xcode 26.6,
on n'ajoute pas un module natif à la légère) :

| Absent / inutilisé | État réel |
|---|---|
| NativeWind / Tailwind | **Pas installé du tout** |
| `react-native-svg` | **Pas installé** (ni direct, ni transitif) — pas d'illustration SVG possible en l'état |
| Lottie | Pas installé |
| `react-native-reanimated` ~4.1.1 | Installé (transitif via screens/gesture-handler), **référencé dans 0 fichier source** — un usage serait le premier |
| `expo-haptics` ~15.0.8 | Installé, **jamais importé** |
| `expo-image` ~3.0.11 | Installé — supporte GIF/WebP animés sans dépendance native supplémentaire |

## Composants partagés — `src/components/ui/`

**Toujours réutiliser ces composants plutôt que redéfinir un style local.**
Import : `import { Button, Card, EmptyState, SectionHeader, StatusBadge } from '../../src/components/ui';`

| Composant | API utile |
|---|---|
| `Button` | `variant` primary/secondary/outline/danger/success/ghost · `size` sm/md/lg · `icon` Ionicons · `loading` · `gradient` pour les CTA principaux · `fullWidth` (défaut `true`) |
| `Card` | `onPress` la rend tactile · `variant` default/flat/elevated/urgent · `padding` clé de SPACING ou `none` |
| `EmptyState` | `icon` + `title` + `subtitle` + `actionLabel`/`onAction` · `compact` pour un état vide de section |
| `SectionHeader` | `title` + `subtitle` + `actionLabel`/`onAction` ou `right` libre |
| `StatusBadge` | `status` seul suffit, couleurs et libellé viennent du thème · `emergency` bascule sur EMERGENCY_STATUS_LABELS · `size` sm/md |

`StatusBadge` est **purement présentationnel** : il ne décide jamais d'un statut ni d'une transition.
Un nouveau statut s'ajoute dans `theme.ts`, pas dans le composant.

Les hauteurs de `Button` sont 40/48/56 ; la taille `sm` reçoit un `hitSlop` pour rester conforme
à la règle des 48px de zone tactile.

## Couleurs de catégories — `getServiceVisual()`
Les familles de services et catégories partenaires ont leur propre palette catégorielle dans
`theme.ts` (`ACCENTS`, `SERVICE_VISUALS`). Ne jamais redéclarer une table icône/couleur dans un
écran : `getServiceVisual('plumbing')` retourne `{ icon, color, bg }` et retombe sur `autre`
si la clé est inconnue.

Cette palette sert à **distinguer** des familles entre elles, jamais à porter un sens d'état.
Succès, erreur et alerte restent sur les tokens fonctionnels de `COLORS`.
