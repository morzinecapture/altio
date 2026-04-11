import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

serve((req) => {
  const url = new URL(req.url)
  const type = url.searchParams.get('type') || 'success'

  // Redirect to the app via deep link
  const deepLink = `altio://provider/profile?stripe=${type}`

  return new Response(
    `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Altio - Retour</title>
  <script>window.location.href = "${deepLink}";</script>
</head>
<body style="font-family: system-ui; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f5f5f5;">
  <div style="text-align: center; padding: 2rem;">
    <h2>${type === 'success' ? 'Configuration terminée !' : 'Reprise en cours...'}</h2>
    <p>Retour vers l'application Altio...</p>
    <p style="margin-top: 1rem;"><a href="${deepLink}">Ouvrir Altio</a></p>
  </div>
</body>
</html>`,
    {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
      status: 200,
    }
  )
})
