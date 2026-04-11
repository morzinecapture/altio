import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { corsHeaders, handleCors } from '../_shared/cors.ts'

/**
 * send-welcome-email
 *
 * Triggered after a new user completes signup.
 * Sends a transactional welcome email via Brevo (ex-Sendinblue).
 * Free tier: 300 emails/jour, pas de carte bancaire requise.
 *
 * Required env vars:
 * - BREVO_API_KEY (from https://app.brevo.com → SMTP & API → API Keys)
 */

const BREVO_API_KEY = Deno.env.get('BREVO_API_KEY')
const FROM_EMAIL = 'morzinecapture@gmail.com'
const FROM_NAME = 'Altio'

serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    if (!BREVO_API_KEY) {
      return new Response(
        JSON.stringify({ skipped: true, reason: 'BREVO_API_KEY not configured' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    const { email, firstName } = await req.json()

    if (!email || typeof email !== 'string') {
      return new Response(
        JSON.stringify({ error: 'email is required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    const displayName = firstName || 'futur utilisateur'

    const htmlContent = `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bienvenue sur Altio</title>
</head>
<body style="margin:0;padding:0;background-color:#F8FAFC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#F8FAFC;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color:#FFFFFF;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06);">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#2563EB,#3B82F6);padding:40px 40px 32px;text-align:center;">
              <div style="width:56px;height:56px;background:rgba(255,255,255,0.2);border-radius:50%;display:inline-flex;align-items:center;justify-content:center;margin-bottom:16px;">
                <span style="font-size:28px;">&#10052;</span>
              </div>
              <h1 style="color:#FFFFFF;font-size:28px;font-weight:700;margin:0 0 8px;">Bienvenue sur Altio !</h1>
              <p style="color:rgba(255,255,255,0.85);font-size:16px;margin:0;">La gestion de vos biens, entre de bonnes mains.</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              <p style="color:#1E293B;font-size:16px;line-height:26px;margin:0 0 24px;">
                Bonjour <strong>${displayName}</strong>,
              </p>
              <p style="color:#64748B;font-size:15px;line-height:24px;margin:0 0 24px;">
                Merci d'avoir rejoint Altio ! Notre mission : vous connecter avec des <strong>prestataires locaux de confiance</strong> (menage, plomberie, electricite, serrurerie...) pour gerer vos locations saisonnieres en toute serenite.
              </p>

              <!-- Comment ca marche -->
              <p style="color:#1E293B;font-size:16px;font-weight:700;margin:0 0 16px;">Comment ca marche ?</p>

              <!-- Urgence -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;">
                <tr>
                  <td style="padding:16px 20px;background:#FEF2F2;border-radius:12px;border-left:4px solid #EF4444;">
                    <p style="color:#DC2626;font-size:14px;font-weight:700;margin:0 0 6px;">&#9888;&#65039; Urgence (fuite, panne, serrure bloquee...)</p>
                    <p style="color:#64748B;font-size:14px;line-height:22px;margin:0;">
                      Appuyez sur <strong>&laquo; Urgence &raquo;</strong> depuis votre tableau de bord. Un prestataire disponible dans votre zone est alerte immediatement. Le premier a accepter intervient dans les plus brefs delais.
                    </p>
                  </td>
                </tr>
              </table>

              <!-- Mission planifiee -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;">
                <tr>
                  <td style="padding:16px 20px;background:#EEF2FF;border-radius:12px;border-left:4px solid #2563EB;">
                    <p style="color:#2563EB;font-size:14px;font-weight:700;margin:0 0 6px;">&#128197; Mission planifiee (menage, entretien, travaux...)</p>
                    <p style="color:#64748B;font-size:14px;line-height:22px;margin:0;">
                      Appuyez sur <strong>&laquo; Nouvelle mission &raquo;</strong>, choisissez votre bien, la categorie de service et la date souhaitee. Les prestataires qualifies de votre zone recevront votre demande et vous pourrez choisir celui qui vous convient.
                    </p>
                  </td>
                </tr>
              </table>

              <!-- Paiement securise -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
                <tr>
                  <td style="padding:16px 20px;background:#F0FDF4;border-radius:12px;border-left:4px solid #22C55E;">
                    <p style="color:#16A34A;font-size:14px;font-weight:700;margin:0 0 6px;">&#128274; Paiement securise</p>
                    <p style="color:#64748B;font-size:14px;line-height:22px;margin:0;">
                      Vous ne payez qu'une fois l'intervention terminee et validee par vos soins. Tout est gere via l'application, en toute transparence.
                    </p>
                  </td>
                </tr>
              </table>

              <!-- Etapes -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 32px;">
                <tr>
                  <td style="padding:16px 20px;background:#F1F5F9;border-radius:12px;">
                    <p style="color:#1E293B;font-size:15px;font-weight:600;margin:0 0 12px;">Pour commencer :</p>
                    <table cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding:4px 0;color:#2563EB;font-size:14px;width:24px;vertical-align:top;">1.</td>
                        <td style="padding:4px 0;color:#64748B;font-size:14px;">Completez votre profil et choisissez votre role</td>
                      </tr>
                      <tr>
                        <td style="padding:4px 0;color:#2563EB;font-size:14px;width:24px;vertical-align:top;">2.</td>
                        <td style="padding:4px 0;color:#64748B;font-size:14px;">Ajoutez votre bien (adresse, type, photos)</td>
                      </tr>
                      <tr>
                        <td style="padding:4px 0;color:#2563EB;font-size:14px;width:24px;vertical-align:top;">3.</td>
                        <td style="padding:4px 0;color:#64748B;font-size:14px;">Publiez votre premiere mission ou declarez une urgence</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <table cellpadding="0" cellspacing="0" style="margin:0 auto;">
                <tr>
                  <td style="background:#2563EB;border-radius:12px;padding:14px 32px;text-align:center;">
                    <a href="https://altio.app" style="color:#FFFFFF;font-size:15px;font-weight:600;text-decoration:none;display:inline-block;">
                      Ouvrir Altio
                    </a>
                  </td>
                </tr>
              </table>

              <p style="color:#94A3B8;font-size:13px;line-height:20px;margin:24px 0 0;text-align:center;">
                Une question ? Repondez directement a cet email, notre equipe vous repond sous 24h.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 40px;background:#F8FAFC;border-top:1px solid #E2E8F0;">
              <p style="color:#94A3B8;font-size:12px;line-height:18px;margin:0;text-align:center;">
                Altio &mdash; Marketplace de services pour la gestion locative saisonniere<br>
                Cet email est envoye automatiquement.<br>
                <a href="https://altio.app/unsubscribe" style="color:#2563EB;text-decoration:none;">Se desinscrire</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

    // Brevo Transactional Email API
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': BREVO_API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        sender: { name: FROM_NAME, email: FROM_EMAIL },
        to: [{ email }],
        subject: 'Bienvenue sur Altio !',
        htmlContent: htmlContent,
      }),
    })

    if (!res.ok) {
      const errorData = await res.text()
      console.error('Brevo error:', errorData)
      return new Response(
        JSON.stringify({ error: 'Failed to send email', details: errorData }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      )
    }

    const data = await res.json()

    return new Response(
      JSON.stringify({ success: true, messageId: data.messageId }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (error: unknown) {
    console.error('send-welcome-email error:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
