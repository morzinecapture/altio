"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ArrowUpRight, Menu, X } from "lucide-react";

export function Logo() {
  return (
    <span className="logo">
      <svg
        width="29"
        height="30"
        viewBox="0 0 29 30"
        fill="none"
        aria-hidden="true"
      >
        <path d="M2 26 13.8 3 27 26H20.5L14 14 8 26Z" fill="currentColor" />
        <path d="m11 26 3.3-6 3.2 6Z" fill="currentColor" />
      </svg>
      altio<span className="logo-dot">.</span>
    </span>
  );
}
export function Header() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  return (
    <header className="site-header">
      <div className="nav-wrap">
        <Link
          href="/"
          aria-label="Altio, accueil"
          onClick={() => setOpen(false)}
        >
          <Logo />
        </Link>
        <nav
          className={open ? "main-nav is-open" : "main-nav"}
          id="main-navigation"
          aria-label="Navigation principale"
        >
          <Link
            href="/proprietaires"
            aria-current={pathname === "/proprietaires" ? "page" : undefined}
            onClick={() => setOpen(false)}
          >
            Propriétaires
          </Link>
          <Link
            href="/prestataires"
            aria-current={pathname === "/prestataires" ? "page" : undefined}
            onClick={() => setOpen(false)}
          >
            Prestataires
          </Link>
          <Link href="/#comment-ca-marche" onClick={() => setOpen(false)}>
            Comment ça marche
          </Link>
          <Link href="/#questions" onClick={() => setOpen(false)}>
            FAQ
          </Link>
          <Link
            className="button button-small nav-cta"
            href="/contact"
            onClick={() => setOpen(false)}
          >
            Parlons de votre projet <ArrowUpRight size={16} />
          </Link>
        </nav>
        <button
          className="menu-toggle"
          aria-expanded={open}
          aria-controls="main-navigation"
          aria-label={open ? "Fermer le menu" : "Ouvrir le menu"}
          onClick={() => setOpen(!open)}
        >
          {open ? <X /> : <Menu />}
        </button>
      </div>
    </header>
  );
}
export function Footer() {
  return (
    <footer className="footer">
      <div className="container footer-top">
        <div>
          <Link href="/" aria-label="Altio, accueil">
            <Logo />
          </Link>
          <p>
            La bonne équipe.
            <br />
            Même quand vous êtes loin.
          </p>
          <span className="footer-location">
            Pensé dans les Alpes. Pour les gens d’ici.
          </span>
        </div>
        <div>
          <span className="footer-label">DÉCOUVRIR ALTIO</span>
          <Link href="/proprietaires">Pour les propriétaires</Link>
          <Link href="/prestataires">Pour les prestataires</Link>
          <Link href="/#comment-ca-marche">Le fonctionnement</Link>
        </div>
        <div>
          <span className="footer-label">ON EN PARLE ?</span>
          <a href="mailto:morzinecapture@gmail.com">
            morzinecapture@gmail.com <ArrowUpRight size={14} />
          </a>
          <Link href="/contact">Contacter l’équipe</Link>
          <Link href="/#questions">Questions fréquentes</Link>
        </div>
      </div>
      <div className="container footer-bottom">
        <span>© {new Date().getFullYear()} Altio</span>
        <span>Moins de gestion. Plus d’horizon.</span>
        <Link href="/confidentialite">Confidentialité</Link>
      </div>
    </footer>
  );
}
