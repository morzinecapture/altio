import content from "@/content/legal.json";
export const metadata = { title: "Conditions générales de vente" };
export default function Page(){ return <main id="main" className="container prose"><span className="eyebrow">ALTIO · 11 OCTOBRE 2026</span><h1>Conditions générales de vente</h1><div dangerouslySetInnerHTML={{__html: content["cgv"]}} /></main>; }
