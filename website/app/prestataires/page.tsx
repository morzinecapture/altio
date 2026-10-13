import type { Metadata } from "next";
import { AudiencePage } from "@/components/audience-page";
export const metadata: Metadata = {
  title: "Prestataires & artisans — Développez votre activité locale",
  description:
    "Ménage, maintenance, conciergerie : présentez votre savoir-faire aux propriétaires de locations saisonnières et organisez vos missions avec Altio.",
  alternates: { canonical: "/prestataires" },
};
export default function Page() {
  return <AudiencePage profile="prestataires" />;
}
