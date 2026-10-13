import Image from "next/image";
import Link from "next/link";
import {
  ArrowUpRight,
  CalendarDays,
  Check,
  FileCheck2,
  House,
  MapPin,
  MessageCircle,
  SlidersHorizontal,
  Wallet,
  Wrench,
} from "lucide-react";

const profiles = [
  {
    id: "proprietaires",
    icon: House,
    label: "PROPRIÉTAIRES & CONCIERGERIES",
    image: "/images/alpes-ete.jpg",
    alt: "Un refuge face à son lac, au pied des montagnes des Dolomites",
    title: "Votre location, organisée. Même à distance.",
    intro:
      "Trouvez les professionnels pour votre logement et coordonnez leurs interventions sans multiplier les outils.",
    cta: "Simplifier la gestion de mes logements",
    benefits: [
      {
        icon: MapPin,
        title: "Trouvez le bon professionnel",
        text: "Ménage, plomberie, entretien : consultez les profils de votre secteur et retrouvez vos favoris.",
      },
      {
        icon: CalendarDays,
        title: "Anticipez les départs et les arrivées",
        text: "Rassemblez vos réservations Airbnb et Booking.com et planifiez les interventions entre deux séjours.",
      },
      {
        icon: MessageCircle,
        title: "Sachez où en est chaque intervention",
        text: "Suivez l’avancement, échangez avec le prestataire et consultez les photos depuis votre téléphone.",
      },
      {
        icon: FileCheck2,
        title: "Centralisez tous vos logements",
        text: "Retrouvez les missions, les documents et les factures de vos biens dans un seul espace.",
      },
    ],
  },
  {
    id: "prestataires",
    icon: Wrench,
    label: "PRESTATAIRES & ARTISANS",
    image: "/images/aiguille-du-midi.jpg",
    alt: "Les sommets et les glaciers autour de l’Aiguille du Midi à Chamonix",
    title: "Des missions locales. Une activité mieux organisée.",
    intro:
      "Faites connaître votre savoir-faire aux propriétaires et conciergeries de votre secteur. Gardez la main sur votre activité.",
    cta: "Développer mon activité avec Altio",
    benefits: [
      {
        icon: MapPin,
        title: "Accédez à de nouveaux clients",
        text: "Présentez votre métier et votre zone pour trouver des demandes de propriétaires proches de vous.",
      },
      {
        icon: SlidersHorizontal,
        title: "Choisissez vos missions",
        text: "Consultez le besoin, proposez votre intervention et choisissez selon vos disponibilités.",
      },
      {
        icon: CalendarDays,
        title: "Organisez vos journées",
        text: "Gardez vos missions, les informations des logements et vos échanges dans le même planning de travail.",
      },
      {
        icon: Wallet,
        title: "Suivez vos revenus et vos factures",
        text: "Retrouvez l’historique de vos interventions et votre suivi financier sans éparpiller vos documents.",
      },
    ],
  },
];

export function Benefits() {
  return (
    <section className="section benefits-section" id="pour-vous">
      <div className="container">
        <div className="benefits-heading">
          <span className="eyebrow">
            UNE APPLICATION. DEUX FAÇONS D’Y GAGNER.
          </span>
          <h2>
            Moins de contraintes.
            <br />
            <span>Plus de possibilités.</span>
          </h2>
          <p>
            Vous louez un logement ou vous intervenez dedans ?<br />
            Voici concrètement ce qu’Altio vous apporte.
          </p>
        </div>
        <div className="benefits-grid">
          {profiles.map((profile) => (
            <article
              className={`benefit-profile ${profile.id}`}
              key={profile.id}
            >
              <div className="benefit-photo">
                <Image
                  src={profile.image}
                  alt={profile.alt}
                  fill
                  sizes="(max-width:760px) 100vw, 50vw"
                />
                <span>
                  <profile.icon size={17} />
                  {profile.label}
                </span>
                <span className="photo-index">
                  {profile.id === "proprietaires" ? "01" : "02"}
                </span>
              </div>
              <div className="benefit-copy">
                <h3>{profile.title}</h3>
                <p className="benefit-intro">{profile.intro}</p>
                <ul>
                  {profile.benefits.map(({ icon: Icon, title, text }) => (
                    <li key={title}>
                      <span className="benefit-icon">
                        <Icon size={21} />
                      </span>
                      <div>
                        <h4>{title}</h4>
                        <p>{text}</p>
                      </div>
                    </li>
                  ))}
                </ul>
                <Link href={`/${profile.id}`} className="button">
                  {profile.cta}
                  <ArrowUpRight size={18} />
                </Link>
              </div>
            </article>
          ))}
        </div>
        <p className="benefits-footnote">
          <Check size={15} /> Chacun garde son rôle : le propriétaire organise,
          le prestataire réalise, Altio facilite la coordination.
        </p>
      </div>
    </section>
  );
}
