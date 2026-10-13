import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  House,
  MapPin,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  Wrench,
} from "lucide-react";
import { FAQ } from "@/components/experience";
import { MountainHero } from "@/components/mountain-hero";
import { Benefits } from "@/components/benefits";
import type { Metadata } from "next";
export const metadata: Metadata = { alternates: { canonical: "/" } };

export default function Home() {
  return (
    <main id="main">
      <MountainHero />
      <div className="service-strip">
        <div className="container">
          <span>
            Votre logement.
            <br />
            <strong>Tous ses besoins.</strong>
          </span>
          <span>
            <Sparkles /> Ménage & linge
          </span>
          <span>
            <Wrench /> Maintenance & dépannage
          </span>
          <span>
            <House /> Conciergerie
          </span>
          <span>
            <CalendarDays /> Organisation & suivi
          </span>
        </div>
      </div>
      <Benefits />
      <section className="section workflow-section" id="comment-ca-marche">
        <div className="container">
          <div className="section-heading">
            <div>
              <span className="eyebrow">
                MOINS DE MESSAGES. PLUS DE CLARTÉ.
              </span>
              <h2>
                Un besoin. Un professionnel.
                <br />
                Une intervention suivie.
              </h2>
            </div>
            <p>
              Un fil conducteur pour chaque intervention.
              <br />
              Vous savez qui fait quoi, et quand.
            </p>
          </div>
          <div className="steps">
            <article>
              <div className="step-top">
                <span>01</span>
                <House size={25} />
              </div>
              <h3>Décrivez votre besoin.</h3>
              <p>
                Ajoutez votre bien et connectez vos calendriers. Organisez le
                ménage ou décrivez l’intervention nécessaire.
              </p>
              <span className="step-bottom">
                Tout part de votre réalité <ArrowRight size={18} />
              </span>
            </article>
            <article>
              <div className="step-top">
                <span>02</span>
                <MapPin size={25} />
              </div>
              <h3>Choisissez votre prestataire.</h3>
              <p>
                Retrouvez des professionnels de votre secteur. Consultez leurs
                profils, échangez et convenez de la mission.
              </p>
              <span className="step-bottom">
                La proximité fait la différence <ArrowRight size={18} />
              </span>
            </article>
            <article>
              <div className="step-top">
                <span>03</span>
                <ShieldCheck size={25} />
              </div>
              <h3>Suivez la mission jusqu’au bout.</h3>
              <p>
                Planning, échanges, photos d’intervention et documents : gardez
                le fil jusqu’à la fin de la prestation.
              </p>
              <span className="step-bottom">
                Vous gardez une vue d’ensemble <Check size={18} />
              </span>
            </article>
          </div>
        </div>
      </section>
      <section className="section features-section">
        <div className="container">
          <div className="features-intro">
            <span className="eyebrow">
              LE TERRAIN RENCONTRE LA TECHNOLOGIE.
            </span>
            <h2>
              Planning, messages, factures.
              <br />
              <span className="muted">Votre quotidien, centralisé.</span>
            </h2>
          </div>
          <div className="bento-grid">
            <article className="bento bento-calendar">
              <div>
                <span className="feature-icon">
                  <CalendarDays size={22} />
                </span>
                <h3>Vos séjours et interventions, réunis.</h3>
                <p>
                  Vos réservations et vos interventions dans un même planning.
                  Pour anticiper les départs, préparer les arrivées et mieux
                  organiser l’entre-deux.
                </p>
                <div className="integration-labels">
                  <span>Airbnb</span>
                  <span>Booking.com</span>
                  <small>Connexion via iCal</small>
                </div>
              </div>
              <div
                className="calendar-preview"
                aria-label="Exemple de planning"
              >
                <div className="calendar-title">
                  <strong>Votre semaine, en clair.</strong>
                  <CalendarDays size={16} />
                </div>
                <div className="calendar-days">
                  {["LUN 12", "MAR 13", "MER 14", "JEU 15", "VEN 16"].map(
                    (d) => (
                      <span key={d}>{d}</span>
                    ),
                  )}
                </div>
                <div className="calendar-grid">
                  <div className="calendar-event stay">
                    Séjour · Chalet des Cimes
                  </div>
                  <div className="calendar-event clean">
                    <Sparkles size={12} /> Ménage
                  </div>
                  <div className="calendar-event repair">
                    <Wrench size={12} /> Maintenance
                  </div>
                  <div className="calendar-event arrival">
                    Prochaine arrivée <ArrowRight size={12} />
                  </div>
                </div>
                <span className="example-label">Planning illustratif</span>
              </div>
            </article>
            <article className="bento bento-blue">
              <span className="feature-icon">
                <MessageCircle size={22} />
              </span>
              <h3>
                Échangez directement
                <br />
                avec votre interlocuteur.
              </h3>
              <p>
                Les échanges liés à chaque mission restent ensemble. Fini le
                détail important perdu entre deux messages.
              </p>
              <div className="chat-bubble">
                Tout est prêt pour l’arrivée.
                <span>
                  14:32 <Check size={12} />
                </span>
              </div>
              <div className="chat-bubble chat-reply">
                Parfait, merci ! <span>14:34</span>
              </div>
            </article>
            <article className="bento bento-simple">
              <span className="feature-icon">
                <ShieldCheck size={22} />
              </span>
              <h3>
                Retrouvez vos factures
                <br />
                et comptes rendus.
              </h3>
              <p>
                Retrouvez le suivi de vos missions, vos comptes rendus et vos
                factures depuis votre espace.
              </p>
              <div className="document-line">
                <span>
                  <Check size={17} />
                </span>
                <div>
                  <strong>Intervention terminée</strong>
                  <small>Compte rendu & photos</small>
                </div>
                <ArrowUpRight size={18} />
              </div>
            </article>
          </div>
        </div>
      </section>
      <section className="manifesto">
        <div className="manifesto-landscape">
          <Image
            src="/images/aiguille-du-midi.jpg"
            fill
            sizes="(max-width: 760px) 100vw, 50vw"
            alt="Les glaciers et sommets de Chamonix vus depuis l’Aiguille du Midi"
          />
          <span>
            <MapPin size={14} /> UNE AUTRE VUE SUR LA LOCATION.
          </span>
        </div>
        <div className="manifesto-copy">
          <span className="eyebrow">ANCRÉ DANS LES ALPES.</span>
          <h2>
            La montagne,
            <br />
            c’est aussi ceux
            <br />
            <em>qui la font vivre.</em>
          </h2>
          <p>
            Derrière chaque séjour réussi, il y a des gens qui préparent,
            entretiennent et prennent soin des lieux.
          </p>
          <p>
            Altio leur donne un espace commun. Pour mieux travailler ensemble,
            valoriser les savoir-faire locaux et rendre la location saisonnière
            plus sereine.
          </p>
          <Link className="text-link" href="/contact">
            Faisons connaissance <ArrowUpRight size={18} />
          </Link>
        </div>
      </section>
      <FAQ />
      <section className="closing-section">
        <div className="container closing">
          <Image
            className="closing-mountain"
            src="/images/mont-blanc.jpg"
            alt="Panorama de montagnes enneigées dans les Alpes françaises"
            fill
            sizes="100vw"
          />
          <span className="eyebrow">ET SI ON SIMPLIFIAIT LA SUITE ?</span>
          <h2>
            Votre prochaine saison
            <br />
            <em>commence ici.</em>
          </h2>
          <p>
            Un logement à faire tourner. Une activité à développer.
            <br />
            Faisons le premier pas ensemble.
          </p>
          <Link href="/contact" className="button button-white">
            Découvrir Altio avec l’équipe <ArrowUpRight size={19} />
          </Link>
          <span className="closing-signature">
            PROPRIÉTAIRES · CONCIERGERIES · PRESTATAIRES
          </span>
        </div>
      </section>
    </main>
  );
}
