import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Politique de confidentialité — Altio</title>
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
    .update-date {
      font-size: 14px;
      color: #666;
      margin-top: 8px;
    }
    h1 { font-size: 32px; font-weight: 700; margin-bottom: 32px; color: #1a1a1a; }
    h2 { font-size: 20px; font-weight: 600; margin: 32px 0 12px; color: #1a1a1a; }
    p, ul { margin-bottom: 16px; font-size: 16px; color: #333; }
    ul { padding-left: 24px; }
    li { margin-bottom: 8px; }
    strong { font-weight: 600; color: #1a1a1a; }
    a { color: #2563eb; text-decoration: none; }
    a:hover { text-decoration: underline; }
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
      <div class="update-date">Dernière mise à jour : 27 mars 2026</div>
    </header>

    <h1>Politique de confidentialité</h1>

    <h2>Article 1 — Responsable du traitement</h2>
    <p>
      <strong>Altio SAS</strong><br>
      Société par actions simplifiée en cours d'immatriculation<br>
      Siège social : Morzine, 74110 Haute-Savoie, France<br>
      Email DPO (Délégué à la Protection des Données) : <a href="mailto:dpo@altio.app">dpo@altio.app</a>
    </p>
    <p>
      Altio SAS est responsable du traitement des données personnelles collectées
      dans le cadre de l'utilisation de l'application Altio, au sens du Règlement
      Général sur la Protection des Données (RGPD — Règlement UE 2016/679) et de la
      loi Informatique et Libertés du 6 janvier 1978 modifiée.
    </p>

    <h2>Article 2 — Données collectées</h2>
    <p>Nous collectons les catégories de données suivantes :</p>
    <ul>
      <li><strong>Données d'identité :</strong> nom, prénom, adresse email, numéro de téléphone, photo de profil</li>
      <li><strong>Données professionnelles (Prestataires) :</strong> numéro SIREN/SIRET, numéro de TVA intracommunautaire, adresse de facturation, qualifications et certifications, attestation d'assurance</li>
      <li><strong>Données de localisation :</strong> adresse des biens immobiliers (Propriétaires), zone d'intervention (Prestataires), géolocalisation en temps réel (uniquement si autorisée par l'Utilisateur)</li>
      <li><strong>Données de paiement :</strong> gérées exclusivement par Stripe — Altio ne stocke jamais les numéros de carte bancaire</li>
      <li><strong>Données d'activité :</strong> missions créées et réalisées, photos d'intervention, messages échangés via la messagerie in-app, avis et notations, historique des connexions</li>
      <li><strong>Données techniques :</strong> adresse IP, type d'appareil, version de l'OS, identifiant push notification, logs d'utilisation, rapports de crash (Sentry)</li>
    </ul>

    <h2>Article 3 — Finalités du traitement</h2>
    <p>Vos données sont utilisées pour les finalités suivantes :</p>
    <ul>
      <li><strong>Exécution du contrat :</strong> fournir les services de mise en relation, gérer les missions, traiter les paiements</li>
      <li><strong>Facturation :</strong> émettre des factures électroniques conformes à la législation française et européenne</li>
      <li><strong>Communication :</strong> envoyer des notifications de mission, des confirmations de paiement, des rappels</li>
      <li><strong>Sécurité :</strong> prévenir les fraudes, détecter les comportements anormaux, assurer la sécurité de la Plateforme</li>
      <li><strong>Amélioration du service :</strong> analyses statistiques anonymisées pour améliorer l'expérience utilisateur</li>
      <li><strong>Obligations légales :</strong> respect des obligations fiscales, comptables et réglementaires</li>
    </ul>

    <h2>Article 4 — Base légale des traitements</h2>
    <p>Les traitements de données personnelles reposent sur les bases légales suivantes :</p>
    <ul>
      <li><strong>Exécution du contrat</strong> (article 6.1.b du RGPD) : les données sont nécessaires à la fourniture des services Altio et à l'exécution des CGU acceptées par l'Utilisateur.</li>
      <li><strong>Obligation légale</strong> (article 6.1.c du RGPD) : conservation des factures pendant 10 ans (Code de commerce), obligations fiscales et comptables, lutte contre la fraude.</li>
      <li><strong>Intérêt légitime</strong> (article 6.1.f du RGPD) : sécurité de la Plateforme, amélioration des services, prévention des abus. Cet intérêt est mis en balance avec vos droits et libertés.</li>
      <li><strong>Consentement</strong> (article 6.1.a du RGPD) : géolocalisation en temps réel, notifications push. Ce consentement peut être retiré à tout moment via les paramètres de votre appareil.</li>
    </ul>

    <h2>Article 5 — Durée de conservation</h2>
    <p>Les données sont conservées pour les durées suivantes :</p>
    <ul>
      <li><strong>Données de compte :</strong> jusqu'à la suppression du compte par l'Utilisateur, puis 3 ans à compter de la dernière activité (prescription)</li>
      <li><strong>Factures et données comptables :</strong> 10 ans (obligation légale — article L123-22 du Code de commerce)</li>
      <li><strong>Logs d'audit et de sécurité :</strong> 5 ans</li>
      <li><strong>Données de session :</strong> 30 jours</li>
      <li><strong>Messages in-app :</strong> 3 ans après la clôture de la mission associée</li>
      <li><strong>Avis et notations :</strong> tant que le compte est actif, puis 3 ans après suppression</li>
    </ul>
    <p>Au-delà de ces durées, les données sont supprimées ou anonymisées de manière irréversible.</p>

    <h2>Article 6 — Vos droits (RGPD)</h2>
    <p>Conformément au RGPD (Règlement UE 2016/679) et à la loi Informatique et Libertés, vous disposez des droits suivants :</p>
    <ul>
      <li><strong>Droit d'accès</strong> (article 15) : obtenir la confirmation que vos données sont traitées et en recevoir une copie.</li>
      <li><strong>Droit de rectification</strong> (article 16) : corriger vos données inexactes ou incomplètes. Vous pouvez modifier la plupart de vos informations directement depuis votre profil dans l'application.</li>
      <li><strong>Droit à l'effacement</strong> (article 17) : demander la suppression de vos données personnelles. Un bouton de suppression de compte est disponible dans les paramètres de l'application. Les données dont la conservation est imposée par la loi (factures, logs d'audit) seront conservées jusqu'à l'expiration du délai légal.</li>
      <li><strong>Droit à la portabilité</strong> (article 20) : recevoir vos données dans un format structuré, couramment utilisé et lisible par machine (export CSV disponible dans l'application).</li>
      <li><strong>Droit d'opposition</strong> (article 21) : vous opposer au traitement de vos données fondé sur l'intérêt légitime, notamment à des fins de prospection.</li>
      <li><strong>Droit à la limitation</strong> (article 18) : demander la limitation du traitement de vos données dans les cas prévus par le RGPD.</li>
      <li><strong>Droit de retirer votre consentement</strong> à tout moment pour les traitements fondés sur le consentement (géolocalisation, notifications push).</li>
      <li><strong>Directives post-mortem :</strong> vous pouvez définir des directives relatives au sort de vos données après votre décès (loi pour une République numérique, article 40-1 de la loi Informatique et Libertés).</li>
    </ul>
    <p>
      <strong>Pour exercer vos droits :</strong> envoyez un email à <a href="mailto:dpo@altio.app">dpo@altio.app</a>
      en précisant votre identité et le droit que vous souhaitez exercer. Réponse sous 30 jours maximum.
    </p>
    <p>
      En cas de difficulté, vous pouvez introduire une réclamation auprès de la
      <strong>CNIL</strong> (Commission Nationale de l'Informatique et des Libertés) :
      <a href="https://www.cnil.fr">www.cnil.fr</a>
    </p>

    <h2>Article 7 — Cookies et traceurs</h2>
    <p>
      L'application mobile Altio n'utilise pas de cookies au sens de la directive ePrivacy.
    </p>
    <p>
      Les tokens de session sont stockés de manière sécurisée dans le Keychain iOS
      ou le Keystore Android. Ces tokens sont nécessaires au fonctionnement de
      l'application et ne constituent pas des traceurs publicitaires.
    </p>
    <p>Aucun traceur publicitaire tiers n'est intégré dans l'application. Aucun tracking cross-app n'est effectué.</p>

    <h2>Article 8 — Destinataires des données</h2>
    <p>Vos données peuvent être communiquées aux catégories de destinataires suivantes :</p>
    <ul>
      <li><strong>Les autres Utilisateurs de la Plateforme :</strong> dans le cadre d'une mission (profil du Prestataire visible par le Propriétaire, adresse du bien partagée après acceptation de la mission)</li>
      <li><strong>Stripe Payments Europe, Ltd. :</strong> pour le traitement des paiements</li>
      <li><strong>Supabase Inc. :</strong> hébergement des données (serveurs EU — Frankfurt)</li>
      <li><strong>Les autorités compétentes :</strong> en cas d'obligation légale ou de réquisition judiciaire</li>
    </ul>
    <p>Aucune donnée n'est vendue ou transmise à des tiers à des fins de prospection commerciale.</p>

    <h2>Article 9 — Transferts hors Union européenne</h2>
    <p>Vos données sont hébergées principalement sur des serveurs situés dans l'Union européenne :</p>
    <ul>
      <li><strong>Supabase :</strong> serveurs EU — Frankfurt (EU-WEST-1)</li>
      <li><strong>Stripe :</strong> siège européen à Dublin, certifié PCI DSS Level 1</li>
    </ul>
    <p>
      En cas de transfert de données vers un pays tiers (notamment les États-Unis
      pour certains services techniques), des garanties adéquates sont mises en place
      conformément au RGPD : clauses contractuelles types approuvées par la Commission
      européenne, adéquation du cadre EU-US Data Privacy Framework.
    </p>

    <h2>Article 10 — Sécurité des données</h2>
    <p>Altio met en œuvre les mesures techniques et organisationnelles appropriées pour garantir la sécurité de vos données :</p>
    <ul>
      <li>Chiffrement des données en transit (TLS 1.3) et au repos</li>
      <li>Authentification sécurisée (Supabase Auth)</li>
      <li>Row Level Security (RLS) pour l'isolation des données entre utilisateurs</li>
      <li>Aucune donnée de carte bancaire stockée (délégué à Stripe, certifié PCI DSS)</li>
      <li>Journalisation des accès et audit régulier</li>
      <li>Politique de mots de passe robustes</li>
    </ul>

    <h2>Article 11 — Contact et réclamation</h2>
    <p>Pour toute question relative à la protection de vos données personnelles :</p>
    <p>
      <strong>Délégué à la Protection des Données (DPO)</strong><br>
      Email : <a href="mailto:dpo@altio.app">dpo@altio.app</a>
    </p>
    <p>
      <strong>Contact général</strong><br>
      Email : <a href="mailto:contact@altio.app">contact@altio.app</a>
    </p>
    <p>Vous pouvez également saisir l'autorité de contrôle compétente :</p>
    <p>
      <strong>CNIL — Commission Nationale de l'Informatique et des Libertés</strong><br>
      3 Place de Fontenoy, TSA 80715<br>
      75334 Paris Cedex 07<br>
      <a href="https://www.cnil.fr">www.cnil.fr</a>
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
