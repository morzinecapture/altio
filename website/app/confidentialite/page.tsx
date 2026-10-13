import content from "@/content/legal.json";
export const metadata = { title: "Confidentialité et données personnelles" };
export default function Page(){ return <main id="main" className="container prose"><span className="eyebrow">ALTIO · 11 OCTOBRE 2026</span><h1>Confidentialité et données personnelles</h1><div dangerouslySetInnerHTML={{__html: content["confidentialite"]}} /></main>; }
