"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import {
  ArrowDown,
  ArrowUpRight,
  House,
  MapPin,
  Snowflake,
  Sun,
  Wrench,
} from "lucide-react";

export function MountainHero() {
  const [season, setSeason] = useState<"winter" | "summer">("winter");
  return (
    <section className="mountain-hero">
      <div
        className={`mountain-backdrop ${season === "summer" ? "is-summer" : ""}`}
      >
        <Image
          className="mountain-winter"
          src="/images/mont-blanc.jpg"
          alt="Un vaste panorama des sommets enneigés de Chamonix"
          fill
          loading="eager"
          fetchPriority="high"
          sizes="100vw"
        />
        {season === "summer" && (
          <Image
            className="mountain-summer"
            src="/images/alpes-ete.jpg"
            alt="Un refuge et son lac au milieu des montagnes des Dolomites en été"
            fill
            sizes="100vw"
          />
        )}
      </div>
      <div className="mountain-overlay" />
      <div className="container mountain-content">
        <span className="mountain-eyebrow">
          <span /> LA LOCATION SAISONNIÈRE, BIEN ENTOURÉE.
        </span>
        <h1>
          Vos locations.
          <br />
          Les bons pros.
          <br />
          <span>Tout simplement.</span>
        </h1>
        <p>
          Altio connecte les propriétaires et conciergeries aux prestataires de
          montagne.{" "}
          <strong>
            Ménage, maintenance, planning et suivi : une seule application pour
            travailler ensemble.
          </strong>
        </p>
        <div className="mountain-actions">
          <Link href="/proprietaires" className="profile-cta">
            <House size={21} />
            <span>
              <strong>Je suis propriétaire</strong>
              <small>Organiser ma location à distance</small>
            </span>
            <ArrowUpRight size={20} />
          </Link>
          <Link href="/prestataires" className="profile-cta profile-cta-dark">
            <Wrench size={21} />
            <span>
              <strong>Je suis prestataire</strong>
              <small>Trouver des missions près de chez moi</small>
            </span>
            <ArrowUpRight size={20} />
          </Link>
        </div>
      </div>
      <div className="container mountain-bottom">
        <a href="#pour-vous">
          <span className="scroll-circle">
            <ArrowDown size={17} />
          </span>
          Ce qu’Altio change pour vous
        </a>
        <div
          className="season-switch"
          role="group"
          aria-label="Choisir le paysage"
        >
          <button
            aria-pressed={season === "winter"}
            onClick={() => setSeason("winter")}
          >
            <Snowflake size={15} /> Hiver
          </button>
          <button
            aria-pressed={season === "summer"}
            onClick={() => setSeason("summer")}
          >
            <Sun size={15} /> Été
          </button>
        </div>
        <span className="landscape-credit">
          <MapPin size={13} />
          {season === "winter"
            ? "CHAMONIX · ALPES FRANÇAISES"
            : "DOLOMITES · ALPES ITALIENNES"}
        </span>
      </div>
    </section>
  );
}
