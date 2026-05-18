# Curido AI: Research Agent

A research agent that plans its own search strategy, runs parallel web searches, and synthesizes everything into a structured brief. Built with Next.js + Groq + Tavily. Fully free tier.

---

## What makes this an agent (not a wrapper)

Most AI research tools take your input, run one search, and summarize it. That's a wrapper — you did all the thinking.

This agent does something different:

1. **Plans its own research strategy** — Groq reads your topic and decides what 4 angles to investigate (overview, recent news, challenges, data). You don't tell it what to search.
2. **Acts on that plan** — runs all 4 Tavily searches in parallel autonomously
3. **Synthesizes across 20+ sources** — merges everything into a structured brief with deduped sources
4. **Shows its work** — streams the research plan and progress to the UI in real time

You give it a goal. It figures out how to get there.

---

## How it works

```
You type: "solid state batteries"
          ↓
Groq plans 4 search angles:
  → "solid state battery technology overview 2025"
  → "solid state battery companies funding news"
  → "solid state battery manufacturing challenges"
  → "solid state battery vs lithium ion data"
          ↓
4 parallel Tavily searches (20 results total)
          ↓
Groq synthesizes everything into a structured brief
          ↓
SSE stream delivers plan + progress + brief to UI in real time
```

---

## Stack

| Layer | Tool | Cost |
|---|---|---|
| Frontend + API routes | Next.js (App Router) | 
| Hosting | Vercel | 
| Web search | Tavily API | 
| LLM (planning + synthesis) | Groq — Llama 3.3 70B | 
| Streaming | Server-sent events (SSE) | 

---

## Project structure

```
research-agent/
├── app/
│   ├── page.tsx              # Frontend — search bar, live plan, brief render
│   ├── layout.tsx            # Root layout
│   └── api/
│       └── research/
│           └── route.ts      # Agent: plan → search → synthesize → stream
├── .env.local                # API keys (never committed)
├── .gitignore
└── package.json
```

---

## Setup

### 1. Scaffold the project

```bash
npx create-next-app@latest research-agent --typescript --tailwind --app
cd research-agent
npm install groq-sdk
```

### 2. Get your API keys

**Tavily** (web search):
- Go to [app.tavily.com](https://app.tavily.com)
- Sign up → API Keys → copy your key
- Free tier: 1,000 searches/month

**Groq** (LLM):
- Go to [console.groq.com](https://console.groq.com)
- Sign up → API Keys → create key → copy it
- Free tier: generous daily limits, no credit card needed

### 3. Create `.env.local`

```env
TAVILY_API_KEY=tvly-...
GROQ_API_KEY=gsk_...
```

Add `.env.local` to `.gitignore` — never commit keys.

---

## Backend — `app/api/research/route.ts`

The route streams server-sent events (SSE) so the frontend updates live as the agent works.

**Three-step agent loop:**

```ts
import Groq from "groq-sdk";
import { NextRequest } from "next/server";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function POST(req: NextRequest) {
  const { topic } = await req.json();
  if (!topic) return new Response("No topic", { status: 400 });

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(event: string, data: unknown) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ event, data })}\n\n`)
        );
      }

      try {
        // Step 1: Groq plans the search queries
        send("status", { message: "Planning research strategy..." });

        const planCompletion = await groq.chat.completions.create({
          model: "llama-3.3-70b-versatile",
          temperature: 0.4,
          messages: [
            {
              role: "system",
              content: `You are a research strategist. Given a topic, return ONLY a valid JSON array of 4 search query strings that cover different angles: overview, recent news, challenges/criticism, and data/statistics. No markdown, no backticks, no explanation. Example: ["query one", "query two", "query three", "query four"]`,
            },
            { role: "user", content: `Topic: "${topic}"` },
          ],
        });

        const planText = planCompletion.choices[0]?.message?.content || "[]";
        let queries: string[] = [];

        try {
          const match = planText.match(/\[[\s\S]*\]/);
          queries = JSON.parse(match ? match[0] : planText);
        } catch {
          queries = [
            `${topic} overview 2025`,
            `${topic} latest news`,
            `${topic} challenges problems`,
            `${topic} data statistics`,
          ];
        }

        send("queries", { queries });

        // Step 2: Run all Tavily searches in parallel
        send("status", { message: `Running ${queries.length} searches in parallel...` });

        const searchResults = await Promise.all(
          queries.map(async (query, i) => {
            send("searching", { index: i, query });

            const res = await fetch("https://api.tavily.com/search", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                api_key: process.env.TAVILY_API_KEY,
                query,
                search_depth: "advanced",
                max_results: 5,
                include_answer: false,
                include_raw_content: false,
              }),
            });

            if (!res.ok) return { query, results: [] };
            const data = await res.json();
            send("done", { index: i });
            return { query, results: data.results || [] };
          })
        );

        // Deduplicate sources across all searches
        const seenUrls = new Set<string>();
        const sources: { title: string; url: string }[] = [];
        for (const { results } of searchResults) {
          for (const r of results) {
            if (!seenUrls.has(r.url)) {
              seenUrls.add(r.url);
              sources.push({ title: r.title, url: r.url });
            }
          }
        }

        const context = searchResults
          .map(
            ({ query, results }) =>
              `### Angle: ${query}\n` +
              results
                .map((r: { title: string; url: string; content: string }, i: number) =>
                  `[${i + 1}] ${r.title}\n${r.content}`
                )
                .join("\n\n")
          )
          .join("\n\n---\n\n");

        // Step 3: Groq synthesizes everything
        send("status", { message: "Synthesizing across all sources..." });

        const synthesis = await groq.chat.completions.create({
          model: "llama-3.3-70b-versatile",
          temperature: 0.3,
          messages: [
            {
              role: "system",
              content: `You are a research analyst. Synthesize search results from multiple angles into a comprehensive brief.
Return ONLY a valid JSON object — no markdown, no backticks:
{
  "title": "Research Brief: [topic]",
  "summary": "2-3 sentence executive summary",
  "keyFindings": "4-6 key findings, each on its own line starting with •",
  "trends": "3-5 current trends or recent developments, each starting with •",
  "outlook": "2-3 sentences on future implications and what to watch"
}`,
            },
            {
              role: "user",
              content: `Topic: "${topic}"\n\nResearch from ${queries.length} angles:\n\n${context}`,
            },
          ],
        });

        const synthText = synthesis.choices[0]?.message?.content || "";
        const match = synthText.match(/\{[\s\S]*\}/);
        const brief = JSON.parse(match ? match[0] : synthText);

        send("brief", { brief, sources });
        send("status", { message: `Done · ${sources.length} sources across ${queries.length} angles` });

      } catch (err: unknown) {
        send("error", { message: err instanceof Error ? err.message : "Something went wrong" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
```

---

## Frontend — `app/page.tsx`

Reads the SSE stream and updates the UI live as events arrive — shows the research plan, per-query progress spinners, and the final brief.

```tsx
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
            if (event === "status") setStatus(data.message);
            else if (event === "queries") { setQueries(data.queries); setState("searching"); }
            else if (event === "done") setDoneIndexes((prev) => new Set([...prev, data.index]));
            else if (event === "brief") { setBrief(data.brief); setSources(data.sources); setState("done"); }
            else if (event === "error") { setError(data.message); setState("error"); }
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

      {/* Search */}
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

      {/* Chips */}
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

      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-6">
          {error}
        </div>
      )}

      {/* Live research plan */}
      {(isLoading || queries.length > 0) && (
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            {isLoading && <span className="w-1.5 h-1.5 rounded-full bg-[#1D9E75] animate-pulse flex-shrink-0" />}
            <span className="text-xs text-[#6b7c74]">{status}</span>
          </div>
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
                  <div key={i} className="flex items-center gap-3 px-4 py-2.5 border-b border-[#f0f7f3] last:border-0 bg-white">
                    <div className="flex-shrink-0 w-4 h-4 flex items-center justify-center">
                      {done ? (
                        <span className="text-[#1D9E75] text-sm">✓</span>
                      ) : active ? (
                        <span className="w-2.5 h-2.5 rounded-full border-2 border-[#1a3a2a] border-t-transparent animate-spin block" />
                      ) : (
                        <span className="w-2 h-2 rounded-full bg-[#c8ddd4] block" />
                      )}
                    </div>
                    <span className={`text-sm ${done ? "text-[#6b7c74]" : "text-[#1a3a2a]"}`}>{q}</span>
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
                  <span className="text-[10px] font-medium uppercase tracking-widest text-[#3B6D11]">{label}</span>
                </div>
                <p className="text-sm text-[#1a3a2a] leading-relaxed whitespace-pre-wrap">{body}</p>
              </div>
            ))}
          </div>
          <div className="border border-[#c8ddd4] rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 bg-[#f2f8f5] border-b border-[#e8f0ec]">
              <span className="text-[10px] font-medium uppercase tracking-widest text-[#3B6D11]">{sources.length} sources</span>
            </div>
            {sources.map((s, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-2.5 border-b border-[#f0f7f3] last:border-0 bg-white">
                <span className="text-xs text-[#9aada5] min-w-[16px]">{i + 1}</span>
                <div className="w-3.5 h-3.5 rounded bg-[#e8f0ec] flex-shrink-0" />
                <a href={s.url} target="_blank" rel="noreferrer" className="text-sm text-[#1a3a2a] hover:text-[#0f6e56] truncate">
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
```

---

## Deploy to Vercel

```bash
npm install -g vercel
vercel
vercel env add TAVILY_API_KEY
vercel env add GROQ_API_KEY
vercel --prod
```

Or via dashboard: push to GitHub → import at [vercel.com/new](https://vercel.com/new) → add env vars → deploy.

---

## Free tier limits

| Service | Free limit | Resets |
|---|---|---|
| Tavily | 1,000 searches/month | Monthly |
| Groq (Llama 3.3 70B) | ~14,400 req/day | Daily |
| Vercel | 100GB bandwidth/month | Monthly |

Note: each research query uses 4 Tavily searches (one per angle). At 1,000/month free that's ~250 full research runs before you hit the limit.

---

## Groq model options

| Model | Speed | Quality | Best for |
|---|---|---|---|
| `llama-3.3-70b-versatile` | Fast | High | Default — best balance |
| `llama-3.1-8b-instant` | Blazing | Good | Maximum speed |
| `mixtral-8x7b-32768` | Fast | High | Longer context windows |

---

## What to build next

- **Iterative depth** — after the first brief, agent reads its own output, spots weak areas, and runs follow-up searches automatically
- **Export to PDF** — download button using `jsPDF`
- **Save history** — persist past briefs to Supabase (free tier)
- **Email digest** — send brief to email via Resend (free tier: 3,000 emails/month)
- **Multi-agent** — orchestrator breaks topic into subtopics, spins up parallel sub-agents, merges into a master brief
- **Memory** — agent remembers past briefs and surfaces connections across sessions
