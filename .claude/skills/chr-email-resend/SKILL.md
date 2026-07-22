---
name: chr-email-resend
description: >
  Emails transactionnels pour CHR Recruiter avec Resend — notification au recruteur
  à chaque nouvelle candidature. Utilise cette skill quand on parle d'email, de notification,
  de Resend, d'envoi automatique, ou de confirmation candidature.
  Triggers : "email", "notification recruteur", "Resend", "envoyer email", "nouvelle candidature email",
  "confirmation candidat", "email transactionnel".
---

# Emails Transactionnels — CHR Recruiter / Resend

## Installation

```bash
npm install resend
```

---

## Emails à envoyer

| Déclencheur | Destinataire | Contenu |
|---|---|---|
| Nouvelle candidature analysée | Recruteur | Nom candidat + score + recommandation + lien fiche |
| Candidature soumise | Candidat | Confirmation de réception |

---

## Client Resend

```typescript
// lib/resend.ts
import { Resend } from 'resend'

export const resend = new Resend(process.env.RESEND_API_KEY)
```

---

## Template email recruteur (React Email)

```bash
npm install @react-email/components
```

```tsx
// emails/NewApplicationEmail.tsx
import {
  Html, Head, Body, Container, Heading, Text, Button, Hr, Section
} from '@react-email/components'

interface NewApplicationEmailProps {
  recruiterName: string
  candidateName: string
  jobTitle: string
  score: number
  recommendation: 'Rappeler' | 'Peut-être' | 'Ne pas rappeler'
  applicationUrl: string
}

export function NewApplicationEmail({
  recruiterName,
  candidateName,
  jobTitle,
  score,
  recommendation,
  applicationUrl,
}: NewApplicationEmailProps) {
  const scoreColor = score >= 70 ? '#16A34A' : score >= 45 ? '#D97706' : '#DC2626'
  const recoBg = recommendation === 'Rappeler' ? '#F0FDF4' : recommendation === 'Peut-être' ? '#FFFBEB' : '#FEF2F2'
  const recoColor = recommendation === 'Rappeler' ? '#16A34A' : recommendation === 'Peut-être' ? '#D97706' : '#DC2626'

  return (
    <Html>
      <Head />
      <Body style={{ fontFamily: 'sans-serif', backgroundColor: '#F0F9FF', margin: 0, padding: 0 }}>
        <Container style={{ maxWidth: '560px', margin: '40px auto', backgroundColor: '#ffffff', borderRadius: '16px', border: '1px solid #BAE6FD', overflow: 'hidden' }}>
          {/* Header */}
          <Section style={{ backgroundColor: '#0369A1', padding: '24px 32px' }}>
            <Heading style={{ color: '#ffffff', fontSize: '20px', margin: 0 }}>
              CHR Recruiter
            </Heading>
          </Section>

          {/* Body */}
          <Section style={{ padding: '32px' }}>
            <Text style={{ color: '#0C4A6E', fontSize: '16px', marginBottom: '8px' }}>
              Bonjour,
            </Text>
            <Text style={{ color: '#334155', fontSize: '15px', lineHeight: '24px' }}>
              Nouvelle candidature reçue pour <strong>{jobTitle}</strong>.
            </Text>

            {/* Score card */}
            <Section style={{ backgroundColor: '#F0F9FF', borderRadius: '12px', padding: '20px', margin: '20px 0', border: '1px solid #BAE6FD' }}>
              <Text style={{ fontSize: '24px', fontWeight: '700', color: '#0C4A6E', margin: '0 0 4px 0' }}>
                {candidateName}
              </Text>
              <Text style={{ fontSize: '13px', color: '#64748B', margin: '0 0 16px 0' }}>
                Candidat(e)
              </Text>
              <Text style={{ fontSize: '14px', color: '#334155', margin: '0 0 8px 0' }}>
                Score IA : <strong style={{ color: scoreColor, fontSize: '18px' }}>{score}/100</strong>
              </Text>
              <Section style={{ backgroundColor: recoBg, borderRadius: '8px', padding: '8px 12px', display: 'inline-block' }}>
                <Text style={{ color: recoColor, fontWeight: '600', fontSize: '14px', margin: 0 }}>
                  {recommendation}
                </Text>
              </Section>
            </Section>

            <Button
              href={applicationUrl}
              style={{
                backgroundColor: '#0369A1',
                color: '#ffffff',
                padding: '12px 24px',
                borderRadius: '12px',
                fontSize: '14px',
                fontWeight: '600',
                textDecoration: 'none',
                display: 'inline-block',
              }}
            >
              Voir la fiche complète →
            </Button>
          </Section>

          <Hr style={{ borderColor: '#BAE6FD', margin: '0 32px' }} />
          <Section style={{ padding: '20px 32px' }}>
            <Text style={{ color: '#94A3B8', fontSize: '12px' }}>
              CHR Recruiter — Vous recevez cet email car vous avez une offre active.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}
```

---

## Envoi depuis l'API route analyze

```typescript
// app/api/analyze/route.ts (ajout après analyse Claude)
import { resend } from '@/lib/resend'
import { NewApplicationEmail } from '@/emails/NewApplicationEmail'
import { render } from '@react-email/components'

// Après stockage du résultat dans Supabase :
async function sendRecruiterNotification({
  recruiterEmail,
  recruiterName,
  candidateName,
  jobTitle,
  score,
  recommendation,
  applicationId,
}: {
  recruiterEmail: string
  recruiterName?: string
  candidateName: string
  jobTitle: string
  score: number
  recommendation: string
  applicationId: string
}) {
  const applicationUrl = `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/applications/${applicationId}`

  await resend.emails.send({
    from: 'CHR Recruiter <noreply@chrrecruiter.fr>',
    to: recruiterEmail,
    subject: `Nouveau candidat : ${candidateName} — Score ${score}/100`,
    react: NewApplicationEmail({
      recruiterName: recruiterName ?? 'Recruteur',
      candidateName,
      jobTitle,
      score,
      recommendation: recommendation as any,
      applicationUrl,
    }),
  })
}
```

---

## Email confirmation candidat (simple)

```typescript
// Dans la même API route, envoyer aussi au candidat :
await resend.emails.send({
  from: 'CHR Recruiter <noreply@chrrecruiter.fr>',
  to: candidateEmail,
  subject: `Votre candidature a bien été reçue — ${jobTitle}`,
  html: `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
      <h2 style="color: #0C4A6E;">Candidature reçue ✓</h2>
      <p>Merci pour votre candidature au poste de <strong>${jobTitle}</strong>.</p>
      <p>Votre dossier a bien été transmis au recruteur. Si votre profil correspond, vous serez recontacté(e) directement.</p>
      <p style="color: #64748B; font-size: 13px;">CHR Recruiter</p>
    </div>
  `,
})
```

---

## Variables d'environnement requises

```env
RESEND_API_KEY=re_xxxxxxxxxxxx
NEXT_PUBLIC_APP_URL=https://chrrecruiter.fr
```

---

## Règles
- Toujours envoyer depuis un domaine vérifié dans Resend (pas gmail)
- Ne jamais bloquer la réponse API en attendant l'email — utiliser `void sendEmail()` ou `await` en dernier
- L'email candidat est une confirmation basique HTML — pas besoin de React Email
- L'email recruteur utilise React Email pour le rendu riche
