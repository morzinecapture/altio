---
name: landing-page-seo
description: Landing page et SEO pour Altio — site web marketing en Next.js séparé de l'app mobile. Utilise cette skill dès qu'on parle de landing page, site web, SEO, référencement, page d'accueil, marketing, acquisition, conversion, meta tags, ou vitrine Altio sur le web.
---

# Landing Page & SEO — Altio

## Architecture
L'app mobile (Expo) est séparée du site marketing (Next.js). Le site web sert à :
1. Expliquer Altio aux propriétaires et prestataires
2. SEO local pour les stations alpines
3. Onboarding web → redirect vers l'app mobile
4. Page pricing / FAQ / support

## Stack site web
- **Next.js 14+** App Router (SSR/SSG)
- **Tailwind CSS**
- **Hébergement** : Vercel
- **Domaine** : altio.app (ou altio.fr)

## Structure pages
```
app/
├── page.tsx                    # Homepage — hero + features + CTA
├── proprietaires/page.tsx      # Landing propriétaires
├── prestataires/page.tsx       # Landing prestataires
├── pricing/page.tsx            # Grille tarifaire
├── stations/
│   ├── page.tsx                # Index stations
│   ├── [slug]/page.tsx         # Page par station (Morzine, Chamonix, etc.)
├── blog/
│   ├── page.tsx                # Blog index
│   └── [slug]/page.tsx         # Articles
├── faq/page.tsx
├── contact/page.tsx
├── mentions-legales/page.tsx
└── sitemap.ts                  # Sitemap dynamique
```

## SEO local — pages par station
Chaque station a sa page optimisée pour le SEO local :

```tsx
// app/stations/[slug]/page.tsx
import { Metadata } from 'next'

const STATIONS = {
  morzine: { name: 'Morzine', department: 'Haute-Savoie', altitude: '1000m' },
  chamonix: { name: 'Chamonix', department: 'Haute-Savoie', altitude: '1035m' },
  megeve: { name: 'Megève', department: 'Haute-Savoie', altitude: '1113m' },
  samoens: { name: 'Samoëns', department: 'Haute-Savoie', altitude: '710m' },
  les_gets: { name: 'Les Gets', department: 'Haute-Savoie', altitude: '1170m' },
}

export async function generateMetadata({ params }): Promise<Metadata> {
  const station = STATIONS[params.slug]
  return {
    title: `Services pour locations saisonnières à ${station.name} | Altio`,
    description: `Trouvez des prestataires de confiance pour vos locations à ${station.name}. Ménage, plomberie, électricité, maintenance. Réservation automatique via Airbnb/Booking.`,
    openGraph: {
      title: `Altio ${station.name} — Services pour locations saisonnières`,
    },
  }
}

export function generateStaticParams() {
  return Object.keys(STATIONS).map(slug => ({ slug }))
}
```

## Mots-clés cibles
- "service ménage location saisonnière [station]"
- "plombier urgence station ski [station]"
- "maintenance location Airbnb [station]"
- "conciergerie locations saisonnières Alpes"
- "prestataire location courte durée montagne"

## Schema.org (données structurées)
```tsx
// Ajouter dans le layout de chaque page station
<script type="application/ld+json">
{JSON.stringify({
  "@context": "https://schema.org",
  "@type": "LocalBusiness",
  "name": "Altio — Services locations saisonnières",
  "description": "Marketplace de services pour locations saisonnières en stations alpines",
  "areaServed": { "@type": "Place", "name": station.name },
  "serviceType": ["Ménage", "Plomberie", "Électricité", "Maintenance"],
})}
</script>
```

## CTA principal
Toutes les pages convergent vers :
- **Propriétaire** : "Téléchargez l'app" (lien App Store / Play Store)
- **Prestataire** : "Inscrivez-vous" (formulaire web → onboarding app)

## Règles
- Toutes les pages en français
- Chaque page a ses meta title + description uniques
- Images optimisées (next/image) avec alt text descriptif
- Vitesse : score Lighthouse > 90
- Sitemap.xml dynamique (inclut toutes les pages stations + blog)
- Canonical URLs sur toutes les pages
- Open Graph images pour le partage social
