# Research Agent — Build & Deploy Guide

A web app that takes a topic, searches the web via Tavily, and produces a structured research brief. Built with Next.js, deployed on Vercel. Fully free tier.

---

## What we're building

- User types a topic
- Backend calls **Tavily Search API** to fetch real, current web results
- Results are passed to **Groq (Llama 3)** to synthesize into a structured brief
- Brief is rendered in a clean UI with summary, key findings, trends, outlook, and sources

---

## Stack

| Layer | Tool | Cost |
|---|---|---|
| Frontend + API routes | Next.js (App Router) | Free |
| Hosting | Vercel | Free tier |
| Web search | Tavily API | 1,000 searches/month free |
| LLM synthesis | Groq — Llama 3.3 70B | Free tier |

---

## Project structure

```
research-agent/
├── app/
│   ├── page.tsx              # Frontend UI
│   ├── layout.tsx            # Root layout
│   └── api/
│       └── research/
│           └── route.ts      # Backend: Tavily search + Groq synthesis
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

```ts
import Groq from "groq-sdk";
import { NextRequest, NextResponse } from "next/server";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function POST(req: NextRequest) {
  const { topic } = await req.json();
  if (!topic) return NextResponse.json({ error: "No topic provided" }, { status: 400 });

  // Step 1: Search the web with Tavily
  const tavilyRes = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: process.env.TAVILY_API_KEY,
      query: topic,
      search_depth: "advanced",
      max_results: 8,
      include_answer: true,
      include_raw_content: false,
    }),
  });

  if (!tavilyRes.ok) {
    return NextResponse.json({ error: "Tavily search failed" }, { status: 500 });
  }

  const tavilyData = await tavilyRes.json();
  const results = tavilyData.results as Array<{
    title: string;
    url: string;
    content: string;
  }>;

  // Format search results for the LLM
  const searchContext = results
    .map((r, i) => `[${i + 1}] ${r.title}\nURL: ${r.url}\n${r.content}`)
    .join("\n\n---\n\n");

  const sources = results.map((r) => ({ title: r.title, url: r.url }));

  // Step 2: Synthesize with Groq (Llama 3.3 70B)
  const completion = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    temperature: 0.3,
    messages: [
      {
        role: "system",
        content: `You are a research analyst. Synthesize web search results into a structured brief.
Return ONLY a valid JSON object — no markdown, no backticks, no preamble:
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
        content: `Topic: "${topic}"\n\nSearch results:\n${searchContext}`,
      },
    ],
  });

  const text = completion.choices[0]?.message?.content || "";

  try {
    const match = text.match(/\{[\s\S]*\}/);
    const brief = JSON.parse(match ? match[0] : text);
    return NextResponse.json({ ...brief, sources });
  } catch {
    return NextResponse.json({ error: "Failed to parse brief", raw: text }, { status: 500 });
  }
}
```

---

## Frontend — `app/page.tsx`

```tsx
"use client";
import { useState } from "react";

type Brief = {
  title: string;
  summary: string;
  keyFindings: string;
  trends: string;
  outlook: string;
  sources: { title: string; url: string }[];
};

export default function Home() {
  const [topic, setTopic] = useState("");
  const [brief, setBrief] = useState<Brief | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const suggestions = [
    "AI agents and autonomous systems",
    "nuclear fusion energy progress",
    "longevity science and aging",
    "solid state batteries",
    "India startup ecosystem 2025",
  ];

  async function research() {
    if (!topic.trim()) return;
    setLoading(true);
    setError("");
    setBrief(null);

    try {
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setBrief(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="max-w-2xl mx-auto px-4 py-12">
      <h1 className="text-2xl font-medium mb-2">Research Agent</h1>
      <p className="text-gray-500 text-sm mb-8">
        Enter a topic. We search the web and produce a structured brief.
      </p>

      <div className="flex gap-2 mb-4">
        <input
          className="flex-1 border border-gray-200 rounded-lg px-4 py-2 text-sm outline-none focus:border-gray-400"
          placeholder="e.g. CRISPR gene editing, quantum computing..."
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && research()}
        />
        <button
          className="px-5 py-2 bg-gray-900 text-white text-sm rounded-lg disabled:opacity-40"
          onClick={research}
          disabled={loading}
        >
          {loading ? "Researching..." : "Research →"}
        </button>
      </div>

      <div className="flex flex-wrap gap-2 mb-8">
        {suggestions.map((s) => (
          <button
            key={s}
            className="text-xs px-3 py-1 border border-gray-200 rounded-full text-gray-500 hover:bg-gray-50"
            onClick={() => setTopic(s)}
          >
            {s}
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 mb-6">
          {error}
        </div>
      )}

      {brief && (
        <div className="space-y-3">
          <h2 className="text-lg font-medium">{brief.title}</h2>

          {[
            { label: "Summary", body: brief.summary },
            { label: "Key findings", body: brief.keyFindings },
            { label: "Trends & developments", body: brief.trends },
            { label: "Outlook & implications", body: brief.outlook },
          ].map(({ label, body }) => (
            <div key={label} className="border border-gray-100 rounded-xl p-4">
              <p className="text-xs uppercase tracking-wide text-gray-400 mb-2">{label}</p>
              <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">{body}</p>
            </div>
          ))}

          <div className="border border-gray-100 rounded-xl p-4">
            <p className="text-xs uppercase tracking-wide text-gray-400 mb-3">Sources</p>
            {brief.sources.map((s, i) => (
              <div key={i} className="flex gap-2 items-start py-1.5 border-t border-gray-50 first:border-0">
                <span className="text-xs bg-gray-100 text-gray-400 rounded px-1.5 py-0.5 mt-0.5 shrink-0">{i + 1}</span>
                <a href={s.url} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline break-all">
                  {s.title || s.url}
                </a>
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
# Install Vercel CLI
npm install -g vercel

# Deploy (follow the prompts — link to your GitHub repo)
vercel

# Add env vars
vercel env add TAVILY_API_KEY
vercel env add GROQ_API_KEY

# Go live
vercel --prod
```

Or via the Vercel dashboard:
1. Push repo to GitHub
2. Import at [vercel.com/new](https://vercel.com/new)
3. Settings → Environment Variables → add `TAVILY_API_KEY` and `GROQ_API_KEY`
4. Redeploy

Your app is live at `https://research-agent-xxx.vercel.app`

---

## How the pipeline works

```
User types topic
       ↓
POST /api/research
       ↓
Tavily Search API
  - search_depth: "advanced"
  - max_results: 8
  - returns titles, URLs, content snippets
       ↓
Format results as numbered context
       ↓
Groq — Llama 3.3 70B Versatile
  - temperature: 0.3 (factual, not creative)
  - system prompt enforces JSON output
       ↓
Parse JSON brief
       ↓
Return to frontend → render sections + sources
```

---

## Free tier limits

| Service | Free limit | Resets |
|---|---|---|
| Tavily | 1,000 searches/month | Monthly |
| Groq (Llama 3.3 70B) | ~14,400 req/day | Daily |
| Vercel | 100GB bandwidth/month | Monthly |

Groq's free tier is extremely generous — you will not hit it for a personal project.

---

## Groq model options

Swap the model string in `route.ts` depending on your needs:

| Model | Speed | Quality | Best for |
|---|---|---|---|
| `llama-3.3-70b-versatile` | Fast | High | Default — best balance |
| `llama-3.1-8b-instant` | Blazing | Good | Maximum speed |
| `mixtral-8x7b-32768` | Fast | High | Longer context windows |

---

## What to build next

- **Multiple Tavily queries** — run 3 searches with different angles (overview, recent news, expert opinion), merge before synthesizing
- **Export to PDF** — add a download button using `jsPDF`
- **Save history** — store past briefs in localStorage or a free Supabase DB
- **Email brief** — send to email using Resend (free tier: 3,000 emails/month)
- **Multi-agent** — orchestrator splits topic into subtopics, runs parallel research agents, merges into a master brief
- **Streaming** — use Groq's streaming API so the brief appears word by word instead of all at once
