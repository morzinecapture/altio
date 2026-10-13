import type { Metadata } from "next";
import { ArrowUpRight, MapPin } from "lucide-react";
import { ContactForm } from "@/components/experience";
export const metadata: Metadata = {
  title: "Contact — Parlons de votre projet",
  description:
    "Un logement à organiser, une activité à développer ? Contactez l’équipe Altio pour découvrir les services et leur disponibilité dans votre secteur.",
  alternates: { canonical: "/contact" },
};
export default function ContactPage() {
  return (
    <main id="main" className="contact-section">
      <div className="container contact-layout">
        <div className="contact-intro">
          <span className="eyebrow">
            LES BELLES HISTOIRES COMMENCENT PAR UN ÉCHANGE.
          </span>
          <h1>
            Votre projet.
            <br />
            <em>Parlons-en.</em>
          </h1>
          <p>
            Vous êtes propriétaire, conciergerie ou prestataire ? Dites-nous où
            vous êtes et ce dont vous avez besoin. L’équipe vous aidera à
            découvrir Altio.
          </p>
          <a className="contact-email" href="mailto:morzinecapture@gmail.com">
            morzinecapture@gmail.com <ArrowUpRight size={19} />
          </a>
          <p>Déjà utilisateur ? Retrouvez l’<a href="/support">assistance de l’application</a>.</p>
          <div className="contact-info">
            <MapPin size={17} /> Un projet ancré dans les Alpes.
          </div>
        </div>
        <ContactForm />
      </div>
    </main>
  );
}
