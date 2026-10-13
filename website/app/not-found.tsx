import Link from "next/link";
export default function NotFound() {
  return (
    <main id="main" className="container prose">
      <span className="eyebrow">404 · HORS-PISTE</span>
      <h1>
        Retrouvons
        <br />
        le bon chemin.
      </h1>
      <p>Cette page n’existe pas ou a changé d’adresse.</p>
      <Link
        href="/"
        className="button"
        style={{ color: "#fff", textDecoration: "none" }}
      >
        Revenir à l’accueil
      </Link>
    </main>
  );
}
