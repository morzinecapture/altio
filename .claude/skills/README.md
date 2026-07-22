# 🛠 Altio Skills Pack — Claude Code

5 skills personnalisées pour développer, surveiller et administrer Altio.

## Les 5 skills

| Skill | Déclencheur | Ce qu'elle fait |
|-------|-------------|-----------------|
| **ux-reviewer** | "audit UX", "c'est moche", "améliorer l'écran" | Audite tes écrans React Native et propose des améliorations avec du code NativeWind prêt à copier |
| **altio-code-checker** | "bug", "ça marche pas", "code review", "RLS" | Vérifie la qualité du code, traque les bugs RLS Supabase, valide TypeScript et la sécurité |
| **altio-onboarding** | "onboarding", "inscription", "premier lancement" | Génère les parcours d'inscription propriétaire/prestataire avec composants et SQL |
| **altio-admin** | "admin", "dashboard", "stats", "gérer les users" | Construit ton panneau d'administration avec stats, modération, gestion et audit |
| **altio-platform-monitor** | "monitoring", "ça plante", "tout va bien ?" | Diagnostique les problèmes en prod, vérifie la santé de la plateforme, configure les alertes |

## Installation dans Claude Code

### Méthode 1 : Copier dans ton projet (recommandé)

```bash
# Depuis la racine de ton projet Altio
mkdir -p .claude/skills

# Copie chaque skill
cp -r altio-skills/ux-reviewer .claude/skills/
cp -r altio-skills/code-checker .claude/skills/
cp -r altio-skills/onboarding-flow .claude/skills/
cp -r altio-skills/admin-dashboard .claude/skills/
cp -r altio-skills/platform-monitor .claude/skills/
```

### Méthode 2 : Référencer dans la config Claude Code

Ajoute dans ton fichier `.claude/settings.json` :

```json
{
  "skills": [
    ".claude/skills/ux-reviewer",
    ".claude/skills/code-checker",
    ".claude/skills/onboarding-flow",
    ".claude/skills/admin-dashboard",
    ".claude/skills/platform-monitor"
  ]
}
```

## Comment les utiliser

Une fois installées, parle naturellement à Claude Code :

```
> "Fais un audit UX de mon écran MissionList"
→ Déclenche ux-reviewer

> "Les missions ne s'affichent pas pour les prestataires"
→ Déclenche altio-code-checker (diagnostic RLS en priorité)

> "Crée le flow d'onboarding pour les prestataires"
→ Déclenche altio-onboarding

> "Je veux un dashboard admin pour voir les stats"
→ Déclenche altio-admin

> "Vérifie que tout va bien sur la plateforme"
→ Déclenche altio-platform-monitor
```

## Personnalisation

Chaque fichier `SKILL.md` est modifiable. Tu peux :
- Ajuster les seuils d'alerte dans `platform-monitor`
- Ajouter des vérifications spécifiques dans `code-checker`
- Modifier le flow d'onboarding selon tes besoins
- Ajouter des sections au dashboard admin

## Stack couverte

- React Native + Expo + TypeScript
- NativeWind (Tailwind CSS)
- Supabase (PostgreSQL, RLS, Auth, Storage, Realtime, Edge Functions)
- Stripe Connect
- Lucide React Native
- React Navigation + Reanimated
