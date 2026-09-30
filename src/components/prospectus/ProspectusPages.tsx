import type { ProspectusSection } from "@/lib/prospectus";
import { splitParagraphs } from "@/lib/prospectus";

type Props = {
  sections: ProspectusSection[];
  imageUrls: Record<string, Record<string, string>>;
};

const lines = (value = "") => value.split("\n").map((line) => line.trim()).filter(Boolean);

function RichText({ text, className = "" }: { text: string; className?: string }) {
  return <div className={className}>{splitParagraphs(text).map((block, index) => {
    const blockLines = lines(block);
    const bullets = blockLines.every((line) => line.startsWith("- "));
    const numbered = blockLines.every((line) => /^\d+\.\s/.test(line));
    if (bullets) return <ul key={index}>{blockLines.map((line) => <li key={line}>{line.slice(2)}</li>)}</ul>;
    if (numbered) return <ol key={index}>{blockLines.map((line) => <li key={line}>{line.replace(/^\d+\.\s/, "")}</li>)}</ol>;
    return <p key={index}>{block}</p>;
  })}</div>;
}

function Page({ page, children, className = "" }: { page: number; children: React.ReactNode; className?: string }) {
  return <section data-prospectus-page={page} className={`prospectus-page ${className}`}>{children}</section>;
}

function Brand({ src }: { src?: string }) {
  return src ? <img src={src} crossOrigin="anonymous" className="prospectus-brand" alt="13 Creators" /> : null;
}

export default function ProspectusPages({ sections, imageUrls }: Props) {
  const byKey = Object.fromEntries(sections.map((section) => [section.layout_key, section]));
  const cover = byKey.cover;
  const why = byKey.why;
  const journey = byKey.journey;
  const training = byKey.training;
  const qa = byKey.qa;
  const expertise = byKey.expertise;
  const contact = byKey.contact;
  const eligibility = byKey.eligibility;
  const application = byKey.application;

  const coverParts = splitParagraphs(cover?.body ?? "");
  const journeyParts = splitParagraphs(journey?.body ?? "");
  const journeyIntro = journeyParts.slice(0, 2).join("\n\n");
  const journeyLearning = journeyParts.slice(2).join("\n\n");
  const trainingParts = splitParagraphs(training?.body ?? "");
  const trainingColumns = [trainingParts.slice(0, 1), trainingParts.slice(1, 2), trainingParts.slice(2)];
  const qaParts = splitParagraphs(qa?.body ?? "");

  return <div className="prospectus-pages">
    <Page page={1} className="prospectus-cover">
      <div className="prospectus-cover-quotes">
        {coverParts.slice(0, 3).map((quote) => <p key={quote}>{quote}</p>)}
      </div>
      <div className="prospectus-cover-main">
        {imageUrls.cover?.logo && <img src={imageUrls.cover.logo} crossOrigin="anonymous" alt="13 Creators" />}
        <div>
          <h1>{cover?.heading ?? "Practitioner Certification"}</h1>
          <p>{coverParts[3]}</p>
        </div>
      </div>
      {imageUrls.cover?.figures && <img className="prospectus-figures" src={imageUrls.cover.figures} crossOrigin="anonymous" alt="The Creator Types" />}
    </Page>

    <Page page={2} className="prospectus-paper">
      <header className="prospectus-split-header">
        <Brand src={imageUrls.why?.logo} />
        {imageUrls.why?.photo && <img className="prospectus-wide-photo" src={imageUrls.why.photo} crossOrigin="anonymous" alt="Creator Types training" />}
      </header>
      <h2 className="prospectus-title-chip">{why?.heading}</h2>
      <RichText text={why?.body ?? ""} className="prospectus-copy prospectus-copy-wide" />
    </Page>

    <Page page={3} className="prospectus-paper prospectus-journey">
      <div className="prospectus-journey-main">
        <Brand src={imageUrls.journey?.logo} />
        <h2 className="prospectus-title-chip">{journey?.heading}</h2>
        <RichText text={journeyIntro} className="prospectus-copy" />
        <div className="prospectus-two-copy"><RichText text={journeyLearning} className="prospectus-copy" /></div>
      </div>
      <aside className="prospectus-photo-rail">
        {imageUrls.journey?.group && <img src={imageUrls.journey.group} crossOrigin="anonymous" alt="Practitioner group" />}
        <div className="prospectus-learning">
          <strong>Learning Styles<br />For All Types!</strong>
          <p><b>AIR</b> loves conversation</p><p><b>EARTH</b> loves practice</p>
          <p><b>WATER</b> loves bonding</p><p><b>FIRE</b> loves change</p>
        </div>
        {imageUrls.journey?.walk && <img src={imageUrls.journey.walk} crossOrigin="anonymous" alt="Practitioners walking together" />}
      </aside>
    </Page>

    <Page page={4} className="prospectus-training" >
      <div className="prospectus-training-grid">
        {trainingColumns.map((column, index) => <article key={index} className={index === 1 ? "prospectus-textured" : ""} style={index === 1 && imageUrls.training?.texture ? { backgroundImage: `linear-gradient(hsl(var(--prospectus-pink) / .74), hsl(var(--prospectus-pink) / .74)), url(${imageUrls.training.texture})` } : undefined}>
          {index === 0 && <><Brand src={imageUrls.training?.logo} /><h2 className="prospectus-title-chip">{training?.heading}</h2></>}
          <RichText text={column.join("\n\n")} className="prospectus-copy" />
          <footer>{["BEGINNER", "INTERMEDIATE", "ADVANCED"][index]}</footer>
        </article>)}
      </div>
    </Page>

    <Page page={5} className="prospectus-paper prospectus-qa">
      <main><h2 className="prospectus-title-chip">{qa?.heading}</h2><div className="prospectus-qa-list">{qaParts.map((part, index) => index % 2 === 0 ? <h3 key={part}>{part}</h3> : <p key={part}>{part}</p>)}</div></main>
      <aside style={imageUrls.qa?.texture ? { backgroundImage: `linear-gradient(hsl(var(--prospectus-magenta) / .78), hsl(var(--prospectus-magenta) / .78)), url(${imageUrls.qa.texture})` } : undefined}>
        <Brand src={imageUrls.qa?.logo} />
        <RichText text={expertise?.body ?? ""} className="prospectus-copy prospectus-copy-light" />
      </aside>
    </Page>

    <Page page={6} className="prospectus-paper prospectus-contact">
      <aside style={imageUrls.qa?.texture ? { backgroundImage: `linear-gradient(hsl(var(--prospectus-magenta) / .78), hsl(var(--prospectus-magenta) / .78)), url(${imageUrls.qa.texture})` } : undefined}>
        <div className="prospectus-contact-card"><Brand src={imageUrls.qa?.logo} /><h2>{contact?.heading}</h2><RichText text={contact?.body ?? ""} className="prospectus-copy" /></div>
      </aside>
      <main>
        <h3>{eligibility?.heading}</h3><RichText text={eligibility?.body ?? ""} className="prospectus-copy" />
        <h3>{application?.heading}</h3><RichText text={application?.body ?? ""} className="prospectus-copy" />
      </main>
    </Page>
  </div>;
}