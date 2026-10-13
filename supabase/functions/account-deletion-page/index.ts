import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Suppression de compte — Altio</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #172033; background: #f5f7fa; line-height: 1.65; }
    main { max-width: 720px; margin: 0 auto; padding: 64px 24px; }
    article { background: #fff; border: 1px solid #e2e7ee; border-radius: 12px; padding: 40px; box-shadow: 0 18px 50px rgba(23,32,51,.08); }
    .brand { font-size: 22px; font-weight: 750; letter-spacing: -.4px; margin-bottom: 40px; }
    h1 { font-size: clamp(30px, 6vw, 44px); line-height: 1.12; letter-spacing: -1.2px; margin: 0 0 18px; }
    h2 { font-size: 20px; margin-top: 32px; }
    p, li { color: #445066; }
    a.button { display: inline-block; margin-top: 12px; padding: 14px 20px; border-radius: 8px; background: #172033; color: #fff; text-decoration: none; font-weight: 700; }
    .note { margin-top: 28px; padding: 16px; border-left: 3px solid #e0a458; background: #fff9ef; }
    footer { margin-top: 24px; color: #6d7789; font-size: 14px; }
    @media (max-width: 560px) { main { padding: 24px 14px; } article { padding: 28px 22px; } }
  </style>
</head>
<body>
  <main>
    <article>
      <div class="brand">Altio</div>
      <h1>Supprimer votre compte Altio</h1>
      <p>Vous pouvez demander la suppression définitive de votre compte et des données personnelles qui lui sont associées.</p>

      <h2>Depuis l’application</h2>
      <ol>
        <li>Ouvrez votre profil.</li>
        <li>Sélectionnez « Supprimer mon compte ».</li>
        <li>Confirmez la demande en suivant les instructions affichées.</li>
      </ol>

      <h2>Sans accès à l’application</h2>
      <p>Envoyez la demande depuis l’adresse email liée au compte. Indiquez votre nom et l’adresse email du compte à supprimer.</p>
      <a class="button" href="mailto:contact@altio.app?subject=Demande%20de%20suppression%20de%20compte%20Altio">Demander la suppression</a>

      <div class="note">
        Les données dont la conservation est imposée par la loi, notamment certains documents comptables, sont conservées pendant la durée légale applicable puis supprimées. Les autres données sont supprimées ou anonymisées après traitement de la demande.
      </div>
    </article>
    <footer>Contact : <a href="mailto:contact@altio.app">contact@altio.app</a></footer>
  </main>
</body>
</html>`;

serve(() => new Response(html, {
  headers: {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "public, max-age=300",
  },
}));
