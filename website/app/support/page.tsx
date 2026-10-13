import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Assistance Altio",
  description: "Aide pour votre compte Altio, vos missions, vos paiements et vos données personnelles.",
  alternates: { canonical: "/support" },
};

export default function SupportPage() {
  return <main id="main" className="container prose">
    <span className="eyebrow">ASSISTANCE</span>
    <h1>Besoin d’aide ?</h1>
    <p>Pour une question sur votre compte, une mission, un devis ou un paiement, écrivez à <a href="mailto:morzinecapture@gmail.com">morzinecapture@gmail.com</a>.</p>
    <h2>Un problème dans l’application</h2>
    <p>Indiquez le modèle de votre téléphone, la version de l’application, les étapes qui provoquent le problème et, si nécessaire, la référence de la mission. Une capture d’écran peut nous aider. Ne transmettez jamais votre mot de passe ni vos coordonnées de carte bancaire.</p>
    <h2>Connexion et compte</h2>
    <p>Utilisez « Mot de passe oublié » depuis l’écran de connexion si vous ne parvenez plus à accéder à votre compte. La suppression du compte est accessible depuis votre profil dans l’application. Si vous n’y avez plus accès, contactez-nous depuis l’adresse associée au compte.</p>
    <h2>Paiement ou réclamation</h2>
    <p>Précisez la référence de la mission ou du devis et la date du paiement. Vous pouvez aussi utiliser la rubrique de réclamation de l’application.</p>
    <h2>Vos données personnelles</h2>
    <p>Pour demander l’accès, la rectification ou la suppression de vos données, contactez <a href="mailto:morzinecapture@gmail.com">morzinecapture@gmail.com</a>. Consultez les <Link href="/confidentialite">informations de confidentialité</Link>.</p>
  </main>;
}
