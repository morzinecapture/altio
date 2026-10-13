import content from "@/content/legal.json";
export const metadata = { title: "Médiation de la consommation" };
export default function Page(){ return <main id="main" className="container prose"><span className="eyebrow">ALTIO · 11 OCTOBRE 2026</span><h1>Médiation de la consommation</h1><div dangerouslySetInnerHTML={{__html: content["mediation"]}} /></main>; }
