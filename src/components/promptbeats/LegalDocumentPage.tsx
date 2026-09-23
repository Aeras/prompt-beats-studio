import { Link } from "@tanstack/react-router";

import { useI18n } from "@/i18n";

type LegalDocumentPageProps = {
  titleEl: string;
  titleEn: string;
  markdownEl: string;
  markdownEn: string;
};

function renderInline(text: string) {
  const parts = text
    .split(/(\*\*[^*]+\*\*|https?:\/\/[^\s)]+|support@promptbeats\.app)/g)
    .filter(Boolean);
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("http://") || part.startsWith("https://")) {
      return (
        <a
          key={index}
          href={part}
          className="text-primary underline underline-offset-2"
          target="_blank"
          rel="noreferrer"
        >
          {part}
        </a>
      );
    }
    if (part === "support@promptbeats.app") {
      return (
        <a
          key={index}
          href="mailto:support@promptbeats.app"
          className="text-primary underline underline-offset-2"
        >
          {part}
        </a>
      );
    }
    return part;
  });
}

function MarkdownDocument({ source }: { source: string }) {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const nodes: React.ReactNode[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    nodes.push(
      <p key={`p-${nodes.length}`} className="leading-7 text-foreground/90">
        {renderInline(paragraph.join(" "))}
      </p>,
    );
    paragraph = [];
  };

  const flushList = () => {
    if (!list.length) return;
    nodes.push(
      <ul key={`ul-${nodes.length}`} className="list-disc space-y-2 pl-6 text-foreground/90">
        {list.map((item, index) => (
          <li key={index}>{renderInline(item)}</li>
        ))}
      </ul>,
    );
    list = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }
    if (line.startsWith("# ")) {
      flushParagraph();
      flushList();
      continue;
    }
    if (line.startsWith("## ")) {
      flushParagraph();
      flushList();
      nodes.push(
        <h2
          key={`h2-${nodes.length}`}
          className="pt-5 font-display text-xl font-bold text-foreground"
        >
          {line.slice(3)}
        </h2>,
      );
      continue;
    }
    if (line.startsWith("### ")) {
      flushParagraph();
      flushList();
      nodes.push(
        <h3
          key={`h3-${nodes.length}`}
          className="pt-3 font-display text-base font-semibold text-foreground"
        >
          {line.slice(4)}
        </h3>,
      );
      continue;
    }
    if (/^\d+\.\s/.test(line)) {
      flushParagraph();
      flushList();
      nodes.push(
        <p key={`n-${nodes.length}`} className="pl-2 leading-7 text-foreground/90">
          {renderInline(line)}
        </p>,
      );
      continue;
    }
    if (line.startsWith("- ")) {
      flushParagraph();
      list.push(line.slice(2));
      continue;
    }
    paragraph.push(line);
  }
  flushParagraph();
  flushList();

  return <div className="space-y-4">{nodes}</div>;
}

export function LegalDocumentPage({
  titleEl,
  titleEn,
  markdownEl,
  markdownEn,
}: LegalDocumentPageProps) {
  const { language } = useI18n();
  const el = language === "el";
  const source = el ? markdownEl : markdownEn;
  const title = el ? titleEl : titleEn;

  return (
    <main className="aurora min-h-screen bg-[#0a0a0c] px-4 py-8 sm:py-12">
      <article className="glass-strong mx-auto w-full max-w-4xl rounded-3xl border border-white/10 p-5 sm:p-8 md:p-10">
        <div className="mb-8 flex items-start justify-between gap-4 border-b border-white/10 pb-5">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-primary">PromptBeats</p>
            <h1 className="mt-2 font-display text-2xl font-bold sm:text-3xl">{title}</h1>
          </div>
          <Link
            to="/"
            className="shrink-0 rounded-xl border border-white/10 px-3 py-2 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
          >
            {el ? "Επιστροφή" : "Back"}
          </Link>
        </div>
        <MarkdownDocument source={source} />
      </article>
    </main>
  );
}
