"use client";

import { useState, FormEvent, KeyboardEvent } from "react";

interface Source {
  title: string;
  url: string;
}

interface ResearchBrief {
  title: string;
  summary: string;
  keyFindings: string;
  trends: string;
  outlook: string;
  sources: Source[];
}

const SUGGESTIONS = [
  "AI agents and autonomous systems",
  "nuclear fusion energy progress",
  "longevity science and aging",
  "solid state batteries",
  "India startup ecosystem 2025",
];

export default function Home() {
  const [topic, setTopic] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [brief, setBrief] = useState<ResearchBrief | null>(null);

  async function runResearch() {
    const trimmed = topic.trim();
    if (!trimmed || loading) return;

    setLoading(true);
    setError(null);
    setBrief(null);

    try {
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: trimmed }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        return;
      }

      setBrief(data as ResearchBrief);
    } catch {
      setError("Failed to connect to the server");
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    runResearch();
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      runResearch();
    }
  }

  return (
    <main className="min-h-screen bg-white text-forest">
      <div className="mx-auto max-w-2xl px-4 py-12">
        <h1 className="mb-1 text-xl font-bold text-forest">Research Agent</h1>
        <p className="mb-8 text-sm text-forest-muted">
          AI-powered research briefs from the web
        </p>

        <form onSubmit={handleSubmit} className="mb-3 flex gap-2">
          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Enter a research topic..."
            className="flex-1 rounded border border-forest px-3 py-2 text-sm text-forest placeholder:text-forest-muted focus:border-forest-light focus:outline-none focus:ring-1 focus:ring-forest-light"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !topic.trim()}
            className="shrink-0 rounded-md border-2 border-forest bg-forest px-6 py-2.5 text-sm font-bold uppercase tracking-wide text-white shadow-md transition-all hover:bg-forest-light hover:shadow-lg disabled:cursor-not-allowed disabled:border-forest-muted disabled:bg-forest-muted disabled:text-white/90 disabled:shadow-none"
          >
            {loading ? "Researching..." : "Research →"}
          </button>
        </form>

        <div className="mb-8 flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setTopic(s)}
              disabled={loading}
              className="rounded-full border border-forest px-3 py-1 text-xs text-forest transition-colors hover:bg-forest hover:text-white disabled:opacity-50"
            >
              {s}
            </button>
          ))}
        </div>

        {error && (
          <div className="mb-6 rounded border border-forest bg-white px-4 py-3 text-sm text-forest">
            {error}
          </div>
        )}

        {loading && (
          <p className="text-sm text-forest-muted">
            Searching and synthesizing...
          </p>
        )}

        {brief && !loading && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-forest">{brief.title}</h2>

            <Section title="Summary">{brief.summary}</Section>
            <Section title="Key findings">{brief.keyFindings}</Section>
            <Section title="Trends & developments">{brief.trends}</Section>
            <Section title="Outlook & implications">{brief.outlook}</Section>

            <div className="rounded border border-forest p-4">
              <h3 className="mb-3 text-sm font-bold text-forest">Sources</h3>
              <ol className="list-decimal space-y-2 pl-5 text-sm text-forest-light">
                {brief.sources.map((source, i) => (
                  <li key={i}>
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-forest underline decoration-forest-muted underline-offset-2 hover:text-forest-light"
                    >
                      {source.title}
                    </a>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded border border-forest p-4">
      <h3 className="mb-2 text-sm font-bold text-forest">{title}</h3>
      <div className="whitespace-pre-wrap text-sm text-forest-light">
        {children}
      </div>
    </div>
  );
}
