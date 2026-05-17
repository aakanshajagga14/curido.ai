# Curido AI: Research Agent

AI-powered research briefs from the web. Enter a topic, search with [Tavily](https://tavily.com), synthesize with [Groq](https://groq.com) (Llama 3.3 70B), and get a structured brief with sources.

## Features

- Web search via Tavily (advanced depth, up to 8 sources)
- LLM synthesis into a structured JSON brief
- Clean UI with summary, key findings, trends, outlook, and linked sources
- One-click topic suggestions to get started quickly

## Tech stack

| Layer | Technology |
|-------|------------|
| Framework | [Next.js](https://nextjs.org) 15 (App Router, TypeScript) |
| Styling | [Tailwind CSS](https://tailwindcss.com) |
| Font | [Lekton](https://fonts.google.com/specimen/Lekton) (Google Fonts) |
| Search | [Tavily API](https://api.tavily.com/search) |
| LLM | [Groq SDK](https://github.com/groq/groq-typescript) — `llama-3.3-70b-versatile` |
| Hosting | [Vercel](https://vercel.com) (recommended) |

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

Open [http://localhost:3000](http://localhost:3000), enter a topic, and click **Research →**.

### Production build

```bash
npm run build
npm start
```

## Deploy on Vercel

1. Push this repo to GitHub (see below if you haven’t yet).
2. Go to [vercel.com](https://vercel.com) → **Add New Project** → import `curido.ai`.
3. Add environment variables in the project settings:

   | Variable | Description |
   |----------|-------------|
   | `TAVILY_API_KEY` | Your Tavily API key |
   | `GROQ_API_KEY` | Your Groq API key |

4. Deploy. Vercel detects Next.js automatically; no extra config required.

API keys stay on the server and are never exposed to the browser.

## How it works

```
User topic → POST /api/research → Tavily search → Groq synthesis → JSON brief + sources → UI
```

1. The frontend sends `{ topic }` to `/api/research`.
2. The API route searches Tavily with `search_depth: advanced` and `max_results: 8`.
3. Results are formatted and sent to Groq with a structured JSON system prompt.
4. The response is parsed and returned with a `sources` array for the UI.

## Project structure

```
app/
  page.tsx              # Frontend UI
  layout.tsx            # Root layout + Lekton font
  globals.css           # Tailwind
  api/
    research/
      route.ts          # Tavily + Groq API route
.env.example            # Env template (commit this)
.env.local              # Your keys (gitignored)
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm start` | Run production server |
| `npm run lint` | Run ESLint |

## License

Private — all rights reserved unless otherwise specified.
