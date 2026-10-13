import type { Metadata } from "next";
import { AudiencePage } from "@/components/audience-page";
export const metadata: Metadata = {
  title: "Propriétaires & conciergeries — Gérez vos locations à distance",
  description:
    "Organisez les services de vos locations saisonnières avec Altio : planning, prestataires locaux, suivi des missions et photos d’intervention.",
  alternates: { canonical: "/proprietaires" },
};
export default function Page() {
  return <AudiencePage profile="proprietaires" />;
}
