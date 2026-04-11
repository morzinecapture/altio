---
name: notifications-sms-email
description: Système de notifications Altio — SMS (Twilio), email (Resend), et push notifications. Utilise cette skill dès qu'on parle de notification, SMS, email, push, alerte, rappel, envoi de message automatique, Twilio, Resend, ou communication avec les utilisateurs.
---

# Notifications — Altio

## Canaux disponibles
1. **Push** : Expo Notifications (gratuit, instantané)
2. **SMS** : Twilio (missions urgentes, prestataires sans smartphone récent)
3. **Email** : Resend (résumés, factures, onboarding)

## Matrice de notifications

| Événement | Destinataire | Push | SMS | Email |
|---|---|---|---|---|
| Nouvelle mission broadcast | Prestataires zone | ✅ | ✅ | ❌ |
| Candidature reçue | Propriétaire | ✅ | ❌ | ✅ |
| Mission assignée | Prestataire | ✅ | ✅ | ✅ |
| Intervention commencée | Propriétaire | ✅ | ❌ | ❌ |
| Intervention terminée | Propriétaire | ✅ | ✅ | ✅ |
| Paiement effectué | Prestataire | ✅ | ❌ | ✅ |
| Mission expirée | Propriétaire | ✅ | ❌ | ✅ |
| Nouveau message | Destinataire | ✅ | ❌ | ❌ |
| Rappel checkout demain | Propriétaire | ✅ | ❌ | ✅ |

## Push Notifications (Expo)
```typescript
// services/notifications.ts
import * as Notifications from 'expo-notifications'
import { supabase } from '@/lib/supabase'

export async function registerForPushNotifications() {
  const { status } = await Notifications.requestPermissionsAsync()
  if (status !== 'granted') return null

  const token = (await Notifications.getExpoPushTokenAsync()).data

  // Sauvegarder le token dans le profil
  await supabase.from('profiles').update({
    expo_push_token: token,
  }).eq('id', (await supabase.auth.getUser()).data.user?.id)

  return token
}
```

### Envoi depuis une Edge Function
```typescript
// supabase/functions/send-notification/index.ts
async function sendPushNotification(expoPushToken: string, title: string, body: string, data?: object) {
  await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      to: expoPushToken,
      title,
      body,
      data,
      sound: 'default',
    }),
  })
}
```

## SMS via Twilio
```typescript
// Uniquement dans les Edge Functions (secret côté serveur)
async function sendSMS(to: string, message: string) {
  const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID')!
  const authToken = Deno.env.get('TWILIO_AUTH_TOKEN')!
  const from = Deno.env.get('TWILIO_PHONE_NUMBER')!

  await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + btoa(`${accountSid}:${authToken}`),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: to, From: from, Body: message }),
    }
  )
}
```

## Templates de messages
```typescript
export const TEMPLATES = {
  mission_broadcast: {
    sms: (service: string, zone: string) =>
      `🔔 Altio: Nouvelle mission ${service} à ${zone}. Ouvrez l'app pour candidater.`,
    push_title: 'Nouvelle mission disponible',
    push_body: (service: string, zone: string) =>
      `${service} à ${zone} — Candidatez maintenant`,
  },
  mission_assigned: {
    sms: (date: string, address: string) =>
      `✅ Altio: Mission confirmée le ${date} au ${address}. Détails dans l'app.`,
    push_title: 'Mission confirmée !',
    push_body: (service: string) => `Votre intervention ${service} est confirmée`,
  },
}
```

## Règles
- SMS uniquement pour les événements critiques (coût ~0.07€/SMS)
- Push en premier choix pour tout — gratuit et instantané
- Email pour tout ce qui est traçable (confirmations, factures)
- Toujours un opt-out par canal dans les préférences utilisateur
- Les numéros français commencent par +33, formater systématiquement
- Ne jamais envoyer de SMS entre 22h et 8h (RGPD/bonnes pratiques)
