import type { Metadata } from "next";
import localFont from "next/font/local";
import { Header, Footer } from "@/components/chrome";
import "./globals.css";
import "./modern.css";

const jakarta = localFont({
  src: [
    { path: "./fonts/regular.ttf", weight: "400" },
    { path: "./fonts/semibold.ttf", weight: "600" },
    { path: "./fonts/bold.ttf", weight: "700" },
  ],
  variable: "--font-jakarta",
  display: "swap",
});
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://altio.app";
export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Altio — Vos locations. Les bons pros. Tout simplement.",
    template: "%s | Altio",
  },
  description:
    "Propriétaires, conciergeries et prestataires : Altio réunit les services, le planning et le suivi de vos locations saisonnières dans une seule application.",
  openGraph: {
    title: "Altio — Propriétaires et prestataires, connectés.",
    description:
      "Trouvez des prestataires, organisez vos locations et développez votre activité dans les Alpes.",
    locale: "fr_FR",
    type: "website",
    siteName: "Altio",
    images: [
      {
        url: "/images/mont-blanc.jpg",
        width: 2200,
        height: 1467,
        alt: "Panorama alpin Altio",
      },
    ],
  },
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr" data-scroll-behavior="smooth">
      <body className={jakarta.variable}>
        <a className="skip-link" href="#main">
          Aller au contenu
        </a>
        <Header />
        {children}
        <Footer />
      </body>
    </html>
  );
}
