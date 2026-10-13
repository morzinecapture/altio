import Image from "next/image";
import Link from "next/link";
import {
  ArrowUpRight,
  CalendarDays,
  FileCheck2,
  MapPin,
  MessageCircle,
  ShieldCheck,
  SlidersHorizontal,
  Wallet,
  Heart,
} from "lucide-react";

const profiles = {
  proprietaires: {
    eyebrow: "PROPRIÉTAIRES & CONCIERGERIES",
    title: "Gérez vos locations.",
    accent: "Même à distance.",
    intro:
      "Trouvez des prestataires locaux pour le ménage, la maintenance et la conciergerie. Organisez leurs interventions, suivez le travail réalisé et retrouvez vos documents dans une seule application.",
    section: "Ce que vous gagnez au quotidien.",
    benefits: [
      {
        icon: CalendarDays,
        title: "Un planning pour vos réservations.",
        text: "Réunissez vos réservations via iCal et préparez les interventions entre deux séjours. Un planning commun pour mieux visualiser les départs, les ménages et les arrivées.",
      },
      {
        icon: MapPin,
        title: "Des professionnels près de votre bien.",
        text: "Trouvez des professionnels dans votre secteur, consultez leurs profils et conservez vos favoris. Construisez progressivement votre équipe de confiance.",
      },
      {
        icon: ShieldCheck,
        title: "De la visibilité sur chaque mission.",
        text: "Retrouvez les échanges, l’avancement des missions et les photos d’intervention. Gardez les informations utiles au même endroit, pour un bien comme pour plusieurs.",
      },
      {
        icon: Heart,
        title: "Retrouvez vos prestataires favoris.",
        text: "Conservez les professionnels avec lesquels vous aimez travailler pour les retrouver facilement lors d’un prochain besoin.",
      },
      {
        icon: MessageCircle,
        title: "Les échanges restent liés au logement.",
        text: "Discutez de la mission, partagez les informations utiles et retrouvez l’historique sans chercher dans plusieurs conversations.",
      },
      {
        icon: FileCheck2,
        title: "Vos documents restent accessibles.",
        text: "Consultez vos factures et les documents liés aux interventions depuis votre espace, pour un logement ou plusieurs.",
      },
    ],
    cta: "Un logement ou tout un portefeuille ?",
    ctaText:
      "Parlons de votre organisation et des services dont vous avez besoin.",
  },
  prestataires: {
    eyebrow: "PRESTATAIRES & ARTISANS",
    title: "Trouvez des missions.",
    accent: "Près de chez vous.",
    intro:
      "Ménage, maintenance, conciergerie, artisanat : présentez votre activité aux propriétaires de votre secteur, choisissez vos missions et centralisez votre planning, vos échanges et vos factures.",
    section: "Des opportunités. Et les outils pour les gérer.",
    benefits: [
      {
        icon: MapPin,
        title: "Touchez de nouveaux clients locaux.",
        text: "Renseignez votre métier et votre zone d’intervention pour trouver des demandes pertinentes. Présentez votre activité aux propriétaires et aux conciergeries qui ont besoin de vous.",
      },
      {
        icon: SlidersHorizontal,
        title: "Choisissez ce que vous acceptez.",
        text: "Choisissez les missions qui vous correspondent et organisez vos disponibilités. Échangez sur les besoins et les conditions avant d’intervenir.",
      },
      {
        icon: FileCheck2,
        title: "Passez moins de temps à tout regrouper.",
        text: "Consultez vos missions, partagez vos comptes rendus et retrouvez vos documents. Votre planning et votre suivi administratif restent à portée de main.",
      },
      {
        icon: CalendarDays,
        title: "Un planning pour organiser vos journées.",
        text: "Retrouvez les dates, horaires et informations de vos missions pour préparer vos interventions et gérer vos disponibilités.",
      },
      {
        icon: MessageCircle,
        title: "Un contact direct avec le donneur d’ordre.",
        text: "Précisez le besoin avant de vous déplacer, échangez sur la prestation et partagez votre compte rendu à la fin.",
      },
      {
        icon: Wallet,
        title: "Une vue sur votre activité et vos revenus.",
        text: "Suivez vos interventions réalisées, votre chiffre d’affaires et vos factures dans votre espace professionnel.",
      },
    ],
    cta: "Et si votre prochaine mission commençait ici ?",
    ctaText:
      "Présentez-nous votre métier et votre secteur. Faisons connaissance.",
  },
};
export function AudiencePage({ profile }: { profile: keyof typeof profiles }) {
  const data = profiles[profile];
  return (
    <main id="main">
      <section className="detail-hero">
        <div className="container">
          <div>
            <span className="eyebrow">{data.eyebrow}</span>
            <h1>
              {data.title}
              <br />
              <em>{data.accent}</em>
            </h1>
            <p>{data.intro}</p>
            <Link className="button" href="/contact">
              Échanger avec l’équipe <ArrowUpRight size={18} />
            </Link>
          </div>
          <div className="detail-art">
            <Image
              src={
                profile === "proprietaires"
                  ? "/images/alpes-ete.jpg"
                  : "/images/aiguille-du-midi.jpg"
              }
              fill
              loading="eager"
              fetchPriority="high"
              sizes="(max-width:760px) 100vw, 45vw"
              alt={
                profile === "proprietaires"
                  ? "Un refuge et un lac dans les montagnes des Dolomites"
                  : "Sommets et glaciers autour de l’Aiguille du Midi à Chamonix"
              }
            />
            <div className="detail-photo-caption">
              <MapPin size={16} />
              <span>
                {profile === "proprietaires"
                  ? "Les lieux dont vous prenez soin."
                  : "Le territoire de votre savoir-faire."}
              </span>
            </div>
          </div>
        </div>
      </section>
      <section className="section">
        <div className="container">
          <span className="eyebrow">CONCRÈTEMENT, POUR VOUS.</span>
          <h2>{data.section}</h2>
          <div className="detail-steps">
            {data.benefits.map(({ icon: Icon, title, text }) => (
              <article key={title}>
                <Icon size={27} />
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
          <div className="detail-cta">
            <div>
              <h3>{data.cta}</h3>
              <p>{data.ctaText}</p>
            </div>
            <Link className="button" href="/contact">
              Parlons de votre projet <ArrowUpRight size={18} />
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
