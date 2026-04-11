import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Support — Altio</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #1a1a1a;
      background: #fff;
      line-height: 1.7;
      -webkit-font-smoothing: antialiased;
    }
    .container { max-width: 800px; margin: 0 auto; padding: 40px 24px 80px; }
    header {
      border-bottom: 1px solid #e5e5e5;
      padding-bottom: 24px;
      margin-bottom: 40px;
    }
    .logo {
      font-size: 28px;
      font-weight: 700;
      color: #1a1a1a;
      letter-spacing: -0.5px;
    }
    h1 { font-size: 32px; font-weight: 700; margin-bottom: 16px; color: #1a1a1a; }
    h2 { font-size: 20px; font-weight: 600; margin: 32px 0 12px; color: #1a1a1a; }
    p { margin-bottom: 16px; font-size: 16px; color: #333; }
    a { color: #2563eb; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .contact-box {
      background: #f9fafb;
      border: 1px solid #e5e5e5;
      border-radius: 12px;
      padding: 24px;
      margin-bottom: 40px;
    }
    .contact-box p { margin-bottom: 8px; }
    .contact-box p:last-child { margin-bottom: 0; }
    .faq-item {
      border-bottom: 1px solid #e5e5e5;
      padding: 20px 0;
    }
    .faq-item:last-child { border-bottom: none; }
    .faq-question {
      font-size: 17px;
      font-weight: 600;
      color: #1a1a1a;
      margin-bottom: 8px;
    }
    .faq-answer {
      font-size: 16px;
      color: #555;
      line-height: 1.7;
    }
    footer {
      margin-top: 60px;
      padding-top: 24px;
      border-top: 1px solid #e5e5e5;
      font-size: 14px;
      color: #999;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="logo">Altio</div>
    </header>

    <h1>Support</h1>
    <p>Besoin d'aide ? Notre équipe est disponible pour répondre à vos questions.</p>

    <div class="contact-box">
      <p><strong>Email :</strong> <a href="mailto:contact@altio.app">contact@altio.app</a></p>
      <p><strong>Délai de réponse :</strong> sous 48 heures (jours ouvrés)</p>
    </div>

    <h2>Questions fréquentes</h2>

    <div class="faq-item">
      <div class="faq-question">Comment créer un compte sur Altio ?</div>
      <div class="faq-answer">
        Téléchargez l'application Altio depuis l'App Store ou le Google Play Store.
        Inscrivez-vous avec votre adresse email ou votre numéro de téléphone.
        Vous serez ensuite guidé pour compléter votre profil en tant que propriétaire
        ou prestataire de services.
      </div>
    </div>

    <div class="faq-item">
      <div class="faq-question">Comment supprimer mon compte ?</div>
      <div class="faq-answer">
        Rendez-vous dans les paramètres de l'application, puis appuyez sur
        « Supprimer mon compte ». La suppression est effective sous 48 heures.
        Toutes vos données personnelles seront supprimées conformément au RGPD,
        à l'exception des données dont la conservation est imposée par la loi
        (factures : 10 ans, logs d'audit : 5 ans). Les missions en cours doivent
        être complétées ou annulées avant la suppression.
        Vous pouvez également demander la suppression par email à
        <a href="mailto:contact@altio.app">contact@altio.app</a>.
      </div>
    </div>

    <div class="faq-item">
      <div class="faq-question">Comment contacter un prestataire ?</div>
      <div class="faq-answer">
        La messagerie in-app est disponible une fois qu'un prestataire a été assigné
        à votre mission. Vous pouvez échanger des messages et des photos directement
        depuis le détail de la mission. Pour des raisons de sécurité, les coordonnées
        personnelles (téléphone, email) ne sont pas partagées avant l'assignation.
      </div>
    </div>

    <div class="faq-item">
      <div class="faq-question">Comment signaler un problème avec une intervention ?</div>
      <div class="faq-answer">
        Après qu'un prestataire a marqué l'intervention comme terminée, vous avez
        la possibilité de valider l'intervention ou de signaler un problème en ouvrant
        un litige. Altio intervient alors pour faciliter la résolution amiable entre
        les parties. Le paiement est suspendu pendant toute la durée du litige.
        Vous pouvez aussi nous contacter directement à
        <a href="mailto:contact@altio.app">contact@altio.app</a>.
      </div>
    </div>

    <div class="faq-item">
      <div class="faq-question">Comment fonctionne le paiement ?</div>
      <div class="faq-answer">
        Le paiement est sécurisé et géré par Stripe. Aucun acompte n'est demandé :
        le paiement est déclenché uniquement après que le propriétaire a validé
        l'intervention. Altio ne stocke aucune donnée de carte bancaire. Des frais
        de service de 10% HT sont appliqués sur chaque mission. Les prestataires
        reçoivent le paiement directement sur leur compte Stripe Connect.
      </div>
    </div>

    <div class="faq-item">
      <div class="faq-question">Où puis-je consulter mes factures ?</div>
      <div class="faq-answer">
        Vos factures sont accessibles directement dans l'application, depuis
        l'historique de vos missions. Chaque mission terminée génère des factures
        électroniques conformes à la législation française. Elles sont conservées
        pendant 10 ans.
      </div>
    </div>

    <h2>Liens utiles</h2>
    <p>
      <a href="/privacy">Politique de confidentialité</a>
    </p>

    <footer>
      &copy; 2026 Altio SAS — Tous droits réservés
    </footer>
  </div>
</body>
</html>`;

serve(() => new Response(html, {
  headers: { "Content-Type": "text/html; charset=utf-8" },
}));
