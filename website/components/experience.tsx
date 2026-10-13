"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight, CircleCheck, Plus } from "lucide-react";

const questions = [
  [
    "Altio, c’est une conciergerie ?",
    "Altio est une plateforme de mise en relation et d’organisation. Elle permet aux propriétaires et aux conciergeries de travailler avec des prestataires locaux, puis de suivre leurs missions dans une seule application. Les prestations sont réalisées par les professionnels, pas par Altio.",
  ],
  [
    "À qui s’adresse l’application ?",
    "Aux propriétaires de locations saisonnières, aux conciergeries qui gèrent plusieurs biens et aux professionnels du terrain : ménage, maintenance, plomberie, électricité, serrurerie et autres services liés au logement.",
  ],
  [
    "Puis-je connecter mes calendriers Airbnb et Booking.com ?",
    "Altio prévoit la synchronisation de vos réservations grâce aux liens iCal de vos plateformes de location. Les séjours sont réunis dans votre planning pour faciliter l’organisation des interventions entre deux voyageurs. La synchronisation n’est pas instantanée : elle dépend aussi des calendriers sources.",
  ],
  [
    "Est-ce que je garde le choix de mes prestataires ?",
    "Oui. Vous pouvez consulter les profils des professionnels et retrouver vos favoris. Les prestataires restent, eux aussi, libres de choisir leurs missions selon leur métier, leur zone et leurs disponibilités.",
  ],
  [
    "Altio est-il disponible dans ma station ?",
    "Le projet est ancré dans les Alpes. La disponibilité des services dépend de votre secteur et des professionnels présents. Contactez-nous en précisant la commune de votre logement ou votre zone d’intervention pour faire le point avec l’équipe.",
  ],
  [
    "Comment découvrir Altio et connaître les tarifs ?",
    "Contactez l’équipe pour une présentation adaptée à votre profil et pour connaître les conditions en vigueur. Nous vous préciserons les modalités d’accès, les services disponibles dans votre secteur et la tarification applicable.",
  ],
];
export function FAQ() {
  return (
    <section className="section faq-section" id="questions">
      <div className="container faq-layout">
        <div>
          <span className="eyebrow">TOUT SIMPLEMENT.</span>
          <h2>
            Les bonnes
            <br />
            questions.
          </h2>
          <p>Et des réponses sans détour.</p>
          <Link className="text-link" href="/contact">
            Une autre question ?<ArrowUpRight size={17} />
          </Link>
        </div>
        <div className="faq-list">
          {questions.map(([question, answer], i) => (
            <details key={question}>
              <summary>
                <span className="faq-number">0{i + 1}</span>
                {question}
                <Plus size={19} />
              </summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

export function ContactForm() {
  const [prepared, setPrepared] = useState(false);
  const [emailUrl, setEmailUrl] = useState("");
  return (
    <form
      className="contact-form"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const body = `Bonjour l’équipe Altio,\n\nJe suis ${form.get("profile")}.\nNom : ${form.get("name")}\nEmail : ${form.get("email")}\nCommune / secteur : ${form.get("location")}\n\n${form.get("message")}\n`;
        setEmailUrl(
          `mailto:morzinecapture@gmail.com?subject=${encodeURIComponent("Découvrir Altio — " + form.get("profile"))}&body=${encodeURIComponent(body)}`,
        );
        setPrepared(true);
      }}
      onChange={() => setPrepared(false)}
    >
      <label>
        Vous êtes
        <select name="profile">
          <option>Propriétaire</option>
          <option>Conciergerie</option>
          <option>Prestataire ou artisan</option>
          <option>Autre</option>
        </select>
      </label>
      <div className="form-row">
        <label>
          Votre nom
          <input
            name="name"
            autoComplete="name"
            required
            maxLength={100}
            placeholder="Camille Martin"
          />
        </label>
        <label>
          Votre email
          <input
            name="email"
            type="email"
            autoComplete="email"
            required
            maxLength={200}
            placeholder="camille@exemple.fr"
          />
        </label>
      </div>
      <label>
        Votre commune ou secteur
        <input
          name="location"
          required
          maxLength={150}
          autoComplete="address-level2"
          placeholder="Morzine, Les Gets…"
        />
      </label>
      <label>
        Parlez-nous de votre projet
        <textarea
          name="message"
          rows={4}
          required
          maxLength={2000}
          placeholder="Un logement à organiser, une activité à développer, une question…"
        />
      </label>
      <p className="form-help">
        Ce formulaire prépare un email. Rien n’est envoyé ni enregistré sur ce
        site. Vous pourrez relire votre message dans votre messagerie avant de
        l’envoyer.
      </p>
      <button className="button" type="submit">
        Préparer mon message <ArrowUpRight size={18} />
      </button>
      {prepared && (
        <div className="form-result" role="status">
          <CircleCheck size={22} />
          <div>
            <strong>Votre message est prêt.</strong>
            <p>Ouvrez votre messagerie pour le relire et l’envoyer.</p>
            <a className="text-link" href={emailUrl}>
              Ouvrir ma messagerie <ArrowUpRight size={16} />
            </a>
          </div>
        </div>
      )}
    </form>
  );
}
