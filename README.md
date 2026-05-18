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

| Layer | Tool |
|---|---|
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

### Scaffold the project

```bash
npx create-next-app@latest research-agent --typescript --tailwind --app
cd research-agent
npm install groq-sdk
```

