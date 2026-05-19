# Curido AI: Research Agent

A research agent that plans its own search strategy, runs parallel web searches, and synthesizes everything into a structured brief. 

## What makes this an agent (not a wrapper)

Most AI research tools take your input, run one search, and summarize it. That's a wrapper — you did all the thinking.

This agent does something different:

- **Plans its own research strategy** — Groq reads your topic and decides what 4 angles to investigate (overview, recent news, challenges, data). You don't tell it what to search.
- **Acts on that plan** — runs all 4 Tavily searches in parallel autonomously
- **Synthesizes across 20+ sources** — merges everything into a structured brief with deduped sources
- **Shows its work** — streams the research plan and progress to the UI in real time

You give it a goal. It figures out how to get there.

## Getting started

### Prerequisites

- [Node.js](https://nodejs.org) 18+
- [Tavily API key](https://tavily.com)
- [Groq API key](https://console.groq.com)

### Install and run locally

```bash
git clone https://github.com/aakanshajagga14/curido.ai.git
cd curido.ai
npm install
```

Copy the example env file and add your keys:

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```env
TAVILY_API_KEY=tvly-your-key-here
GROQ_API_KEY=gsk_your-key-here
```

Start the dev server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), enter a topic, and click **Research**.

### Production build

```bash
npm run build
npm start
```

## Deploy on Vercel

1. Push this repo to GitHub.
2. Go to [vercel.com](https://vercel.com) → **Add New Project** → import `curido.ai`.
3. Add environment variables:

   | Variable | Description |
   |----------|-------------|
   | `TAVILY_API_KEY` | Your Tavily API key |
   | `GROQ_API_KEY` | Your Groq API key |

4. Deploy. Increase **Function Max Duration** (e.g. 60s) if requests time out.

API keys stay on the server and are never exposed to the browser.

## License

Private — all rights reserved unless otherwise specified.
