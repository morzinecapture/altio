---
name: chr-ui-system
description: >
  Design system complet pour CHR Recruiter — Next.js + Tailwind + Framer Motion.
  Utilise cette skill dès qu'on parle de style, design, couleurs, animations, transitions,
  composants UI, boutons, cards, badges de score, layout, typographie, ou expérience visuelle.
  Triggers : "design", "style", "animation", "UI", "composant", "couleur", "framer motion",
  "badge score", "card candidat", "transition page", "skeleton loader", "micro-interaction".
---

# Design System — CHR Recruiter

> Inspiré de **UI/UX Pro Max** — Style : Flat Design + Minimalism (recommandé Job Board)
> Dashboard style : Executive Dashboard avec KPIs count-up

---

## Palette de couleurs (Job Board / Recruitment)

```typescript
// lib/design-tokens.ts
export const colors = {
  primary: '#0369A1',       // Bleu professionnel — actions principales
  primaryLight: '#F0F9FF',
  primaryDark: '#0C4A6E',
  secondary: '#0EA5E9',     // Bleu clair — hover, accents
  accent: '#16A34A',        // Vert succès — score élevé, "Rappeler"
  accentLight: '#F0FDF4',
  warning: '#F59E0B',       // Orange — "Peut-être"
  warningLight: '#FFFBEB',
  danger: '#DC2626',        // Rouge — flags, "Ne pas rappeler"
  dangerLight: '#FEF2F2',
  bg: '#F0F9FF',
  card: '#FFFFFF',
  border: '#BAE6FD',
  muted: '#E7EFF5',
  mutedFg: '#64748B',
  fg: '#0C4A6E',
  fgDark: '#020617',
}
```

---

## Typographie — Plus Jakarta Sans (Friendly SaaS)

```bash
# Installation
npm install @fontsource/plus-jakarta-sans
```

```typescript
// app/layout.tsx
import '@fontsource/plus-jakarta-sans/300.css'
import '@fontsource/plus-jakarta-sans/400.css'
import '@fontsource/plus-jakarta-sans/500.css'
import '@fontsource/plus-jakarta-sans/600.css'
import '@fontsource/plus-jakarta-sans/700.css'
```

```javascript
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'sans-serif'],
      },
    },
  },
}
```

### Hiérarchie typographique
| Rôle | Taille | Poids |
|------|--------|-------|
| Titre page | 28px | 700 |
| Titre section | 20px | 600 |
| Titre card | 16px | 600 |
| Corps | 14px | 400 |
| Label | 12px | 500 |
| Score KPI | 48px | 700 |

---

## Animations Framer Motion

```bash
npm install framer-motion
```

### 1. Entrée de page (fade + slide up)

```tsx
// components/ui/PageTransition.tsx
'use client'
import { motion } from 'framer-motion'

export function PageTransition({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  )
}
```

### 2. Liste staggerée de candidatures

```tsx
// components/ui/StaggerList.tsx
'use client'
import { motion } from 'framer-motion'

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.06 },
  },
}

const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.2 } },
}

export function StaggerList({ children }: { children: React.ReactNode[] }) {
  return (
    <motion.ul variants={container} initial="hidden" animate="show" className="space-y-3">
      {children.map((child, i) => (
        <motion.li key={i} variants={item}>
          {child}
        </motion.li>
      ))}
    </motion.ul>
  )
}
```

### 3. Score counter animé (count-up)

```tsx
// components/ui/ScoreCounter.tsx
'use client'
import { useEffect, useRef } from 'react'
import { useMotionValue, useSpring, useTransform, motion } from 'framer-motion'

export function ScoreCounter({ score }: { score: number }) {
  const raw = useMotionValue(0)
  const spring = useSpring(raw, { stiffness: 80, damping: 15 })
  const display = useTransform(spring, (v) => Math.round(v))

  useEffect(() => {
    raw.set(score)
  }, [score, raw])

  return (
    <div className="flex flex-col items-center">
      <motion.span
        className="text-5xl font-bold"
        style={{
          color: score >= 70 ? '#16A34A' : score >= 45 ? '#F59E0B' : '#DC2626',
        }}
      >
        {display}
      </motion.span>
      <span className="text-sm text-slate-500 mt-1">/ 100</span>
    </div>
  )
}
```

### 4. Timer countdown avec animation pulse

```tsx
// components/ui/TimerBar.tsx
'use client'
import { motion } from 'framer-motion'

interface TimerBarProps {
  timeLeft: number
  totalTime: number
}

export function TimerBar({ timeLeft, totalTime }: TimerBarProps) {
  const ratio = timeLeft / totalTime
  const color = ratio > 0.5 ? '#16A34A' : ratio > 0.25 ? '#F59E0B' : '#DC2626'
  const isPulsing = ratio <= 0.25

  return (
    <div className="relative w-full h-2 bg-slate-100 rounded-full overflow-hidden">
      <motion.div
        className="h-full rounded-full"
        style={{ backgroundColor: color }}
        animate={{ width: `${ratio * 100}%` }}
        transition={{ duration: 1, ease: 'linear' }}
      />
      {isPulsing && (
        <motion.div
          className="absolute inset-0 rounded-full"
          style={{ backgroundColor: color, opacity: 0.4 }}
          animate={{ scale: [1, 1.02, 1] }}
          transition={{ repeat: Infinity, duration: 0.8 }}
        />
      )}
    </div>
  )
}
```

### 5. Badge de recommandation animé

```tsx
// components/ui/RecommendationBadge.tsx
'use client'
import { motion } from 'framer-motion'

const CONFIG = {
  'Rappeler': {
    bg: 'bg-green-50',
    text: 'text-green-700',
    border: 'border-green-200',
    dot: '#16A34A',
  },
  'Peut-être': {
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    border: 'border-amber-200',
    dot: '#F59E0B',
  },
  'Ne pas rappeler': {
    bg: 'bg-red-50',
    text: 'text-red-700',
    border: 'border-red-200',
    dot: '#DC2626',
  },
}

export function RecommendationBadge({
  recommendation,
}: {
  recommendation: keyof typeof CONFIG
}) {
  const cfg = CONFIG[recommendation]
  return (
    <motion.span
      initial={{ scale: 0.85, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 200, damping: 12 }}
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold border ${cfg.bg} ${cfg.text} ${cfg.border}`}
    >
      <motion.span
        className="w-2 h-2 rounded-full"
        style={{ backgroundColor: cfg.dot }}
        animate={
          recommendation === 'Rappeler'
            ? { scale: [1, 1.3, 1] }
            : {}
        }
        transition={{ repeat: Infinity, duration: 1.5 }}
      />
      {recommendation}
    </motion.span>
  )
}
```

### 6. Card candidature avec hover lift

```tsx
// components/ApplicationCard.tsx
'use client'
import { motion } from 'framer-motion'
import { ScoreCounter } from './ui/ScoreCounter'
import { RecommendationBadge } from './ui/RecommendationBadge'

export function ApplicationCard({ application }: { application: any }) {
  return (
    <motion.div
      whileHover={{ y: -2, boxShadow: '0 8px 24px rgba(3,105,161,0.1)' }}
      whileTap={{ scale: 0.99 }}
      transition={{ duration: 0.15 }}
      className="bg-white rounded-2xl border border-blue-100 p-5 cursor-pointer"
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="font-semibold text-slate-800">{application.candidate_name}</p>
          <p className="text-sm text-slate-500 mt-0.5">{application.candidate_email}</p>
        </div>
        <ScoreCounter score={application.ai_score} />
      </div>
      <div className="mt-4 flex items-center gap-2">
        <RecommendationBadge recommendation={application.ai_analysis?.recommandation} />
        <span className="text-xs text-slate-400 ml-auto">
          {application.response_time_seconds}s de réponse
        </span>
      </div>
    </motion.div>
  )
}
```

### 7. Skeleton loader animé

```tsx
// components/ui/Skeleton.tsx
'use client'
import { motion } from 'framer-motion'

export function CardSkeleton() {
  return (
    <div className="bg-white rounded-2xl border border-blue-100 p-5">
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <motion.div
            className="h-4 bg-slate-100 rounded-full w-36"
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ repeat: Infinity, duration: 1.4, ease: 'easeInOut' }}
          />
          <motion.div
            className="h-3 bg-slate-100 rounded-full w-48"
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ repeat: Infinity, duration: 1.4, ease: 'easeInOut', delay: 0.2 }}
          />
        </div>
        <motion.div
          className="h-12 w-12 bg-slate-100 rounded-full"
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ repeat: Infinity, duration: 1.4, ease: 'easeInOut', delay: 0.1 }}
        />
      </div>
      <motion.div
        className="mt-4 h-6 bg-slate-100 rounded-full w-24"
        animate={{ opacity: [0.5, 1, 0.5] }}
        transition={{ repeat: Infinity, duration: 1.4, ease: 'easeInOut', delay: 0.3 }}
      />
    </div>
  )
}
```

---

## Layout global dashboard

```tsx
// app/dashboard/layout.tsx
import { PageTransition } from '@/components/ui/PageTransition'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#F0F9FF] font-sans">
      <nav className="bg-white border-b border-blue-100 px-6 py-4 flex items-center justify-between">
        <span className="font-bold text-xl text-[#0C4A6E]">CHR Recruiter</span>
        {/* user menu */}
      </nav>
      <main className="max-w-5xl mx-auto px-4 py-8">
        <PageTransition>{children}</PageTransition>
      </main>
    </div>
  )
}
```

---

## Règles UX (from ui-ux-pro-max)

- **Executive Dashboard** : 4-6 KPIs max en haut (total candidatures, score moyen, à rappeler, nb offres)
- **Flat Design + Minimalism** : pas de gradients complexes, borders légères, whitespace généreux
- **Score couleur** : vert ≥ 70, orange 45-69, rouge < 45
- **Animations** : duration 150-250ms max — jamais ralentir l'utilisateur
- **Mobile first** : tous les composants responsive, grille 1 col mobile / 2 col tablette / 3 col desktop
- **Micro-interactions** : hover sur chaque card cliquable, `whileTap: scale 0.99`
