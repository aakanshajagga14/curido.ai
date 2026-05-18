"use client";
import { useState, useRef } from "react";

type Brief = {
  title: string;
  summary: string;
  keyFindings: string;
  trends: string;
  outlook: string;
};

type Source = { title: string; url: string };

type SearchState = "idle" | "planning" | "searching" | "synthesizing" | "done" | "error";

export default function Home() {
  const [topic, setTopic] = useState("");
  const [state, setState] = useState<SearchState>("idle");
  const [status, setStatus] = useState("");
  const [queries, setQueries] = useState<string[]>([]);
  const [doneIndexes, setDoneIndexes] = useState<Set<number>>(new Set());
  const [brief, setBrief] = useState<Brief | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [error, setError] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  const suggestions = [
    "AI agents and autonomous systems",
    "nuclear fusion energy progress",
    "longevity science and aging",
    "solid state batteries",
    "India startup ecosystem 2025",
  ];

  async function research() {
    if (!topic.trim()) return;

    abortRef.current?.abort();
    abortRef.current = new AbortController();

    setState("planning");
    setStatus("Planning research strategy...");
    setQueries([]);
    setDoneIndexes(new Set());
    setBrief(null);
    setSources([]);
    setError("");

    try {
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic }),
        signal: abortRef.current.signal,
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Request failed (${res.status})`);
      }
      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const { event, data } = JSON.parse(line.slice(6));

            if (event === "status") {
              setStatus(data.message);
              if (data.message?.includes("Synthesizing")) {
                setState("synthesizing");
              }
            } else if (event === "queries") {
              setQueries(data.queries);
              setState("searching");
            } else if (event === "done") {
              setDoneIndexes((prev) => new Set([...prev, data.index]));
            } else if (event === "synthesizing") {
              setState("synthesizing");
            } else if (event === "brief") {
              setBrief(data.brief);
              setSources(data.sources);
              setState("done");
            } else if (event === "error") {
              setError(data.message);
              setState("error");
            }
          } catch {}
        }
      }
    } catch (err: unknown) {
      if ((err as Error).name !== "AbortError") {
        setError(err instanceof Error ? err.message : "Something went wrong");
        setState("error");
      }
    }
  }

  const isLoading = state === "planning" || state === "searching" || state === "synthesizing";

  return (
    <main className="max-w-2xl mx-auto px-4 py-12">
      {/* Header */}
      <div className="flex items-center gap-2 mb-1">
        <div className="w-5 h-5 rounded-md bg-[#1a3a2a] flex items-center justify-center">
          <div className="w-2 h-2 rounded-full bg-[#5DCAA5]" />
        </div>
        <span className="text-sm font-medium text-[#1a3a2a]">Research</span>
      </div>
      <p className="text-sm text-[#6b7c74] mb-10 pl-7">Search the web. Get a structured brief.</p>

      {/* Search bar */}
      <div className="flex items-center border-[1.5px] border-[#1a3a2a] rounded-xl bg-white overflow-hidden mb-3">
        <span className="pl-3 pr-2 text-[#1a3a2a] text-base">⌕</span>
        <input
          className="flex-1 border-none outline-none bg-transparent text-sm text-[#1a3a2a] py-2.5 placeholder:text-[#9aada5]"
          placeholder="What do you want to research?"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && research()}
        />
        <button
          className="m-1 px-4 py-1.5 bg-[#1a3a2a] text-white text-sm font-medium rounded-lg disabled:opacity-40"
          onClick={research}
          disabled={isLoading}
        >
          {isLoading ? "Thinking..." : "Research"}
        </button>
      </div>

      {/* Suggestion chips */}
      <div className="flex flex-wrap gap-1.5 mb-10">
        {suggestions.map((s) => (
          <button
            key={s}
            onClick={() => setTopic(s)}
            className="text-xs px-3 py-1 bg-[#EAF3DE] text-[#3B6D11] border border-[#C0DD97] rounded-full hover:bg-[#C0DD97] transition-colors"
          >
            {s}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-6">
          {error}
        </div>
      )}

      {/* Agent thought process */}
      {(isLoading || queries.length > 0) && (
        <div className="mb-8">
          {/* Status line */}
          <div className="flex items-center gap-2 mb-4">
            {isLoading && (
              <span className="w-1.5 h-1.5 rounded-full bg-[#1D9E75] animate-pulse flex-shrink-0" />
            )}
            <span className="text-xs text-[#6b7c74]">{status}</span>
          </div>

          {/* Query plan */}
          {queries.length > 0 && (
            <div className="border border-[#c8ddd4] rounded-xl overflow-hidden">
              <div className="px-4 py-2.5 bg-[#f2f8f5] border-b border-[#e8f0ec]">
                <span className="text-[10px] font-medium uppercase tracking-widest text-[#3B6D11]">
                  Research plan · {queries.length} angles
                </span>
              </div>
              {queries.map((q, i) => {
                const done = doneIndexes.has(i);
                const active = state === "searching" && !done;
                return (
                  <div
                    key={i}
                    className="flex items-center gap-3 px-4 py-2.5 border-b border-[#f0f7f3] last:border-0 bg-white"
                  >
                    <div className="flex-shrink-0 w-4 h-4 flex items-center justify-center">
                      {done ? (
                        <span className="text-[#1D9E75] text-sm">✓</span>
                      ) : active ? (
                        <span className="w-2.5 h-2.5 rounded-full border-2 border-[#1a3a2a] border-t-transparent animate-spin block" />
                      ) : (
                        <span className="w-2 h-2 rounded-full bg-[#c8ddd4] block" />
                      )}
                    </div>
                    <span className={`text-sm ${done ? "text-[#6b7c74]" : "text-[#1a3a2a]"}`}>
                      {q}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Brief */}
      {brief && (
        <div>
          <h2 className="text-xl font-medium text-[#1a3a2a] mb-1">{brief.title}</h2>
          <p className="text-xs text-[#6b7c74] mb-6">{sources.length} sources · just now</p>

          {/* Sections */}
          <div className="border border-[#c8ddd4] rounded-xl overflow-hidden mb-3">
            {[
              { label: "Summary", icon: "📄", body: brief.summary },
              { label: "Key findings", icon: "✅", body: brief.keyFindings },
              { label: "Trends & developments", icon: "📈", body: brief.trends },
              { label: "Outlook", icon: "🔭", body: brief.outlook },
            ].map(({ label, icon, body }) => (
              <div key={label} className="px-5 py-4 border-b border-[#e8f0ec] last:border-0 bg-white">
                <div className="flex items-center gap-2 mb-2.5">
                  <span className="text-sm">{icon}</span>
                  <span className="text-[10px] font-medium uppercase tracking-widest text-[#3B6D11]">
                    {label}
                  </span>
                </div>
                <p className="text-sm text-[#1a3a2a] leading-relaxed whitespace-pre-wrap">{body}</p>
              </div>
            ))}
          </div>

          {/* Sources */}
          <div className="border border-[#c8ddd4] rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 bg-[#f2f8f5] border-b border-[#e8f0ec]">
              <span className="text-[10px] font-medium uppercase tracking-widest text-[#3B6D11]">
                {sources.length} sources
              </span>
            </div>
            {sources.map((s, i) => (
              <div
                key={i}
                className="flex items-center gap-3 px-4 py-2.5 border-b border-[#f0f7f3] last:border-0 bg-white"
              >
                <span className="text-xs text-[#9aada5] min-w-[16px]">{i + 1}</span>
                <div className="w-3.5 h-3.5 rounded bg-[#e8f0ec] flex-shrink-0" />
                <a
                  href={s.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-[#1a3a2a] hover:text-[#0f6e56] truncate"
                >
                  {s.title || s.url}
                </a>
                <span className="ml-auto text-xs text-[#9aada5] flex-shrink-0">↗</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
