import content from "@/content/legal.json";
export const metadata = { title: "Mentions légales" };
export default function Page(){ return <main id="main" className="container prose"><span className="eyebrow">ALTIO · 11 OCTOBRE 2026</span><h1>Mentions légales</h1><div dangerouslySetInnerHTML={{__html: content["mentions-legales"]}} /></main>; }
