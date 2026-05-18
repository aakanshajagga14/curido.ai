import Groq from "groq-sdk";
import { NextRequest } from "next/server";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

function normalizeBrief(raw: Record<string, unknown>) {
  const toText = (v: unknown) => {
    if (Array.isArray(v)) {
      return v
        .map((x) => {
          const line = String(x).trim();
          return line.startsWith("•") ? line : `• ${line}`;
        })
        .filter(Boolean)
        .join("\n");
    }
    return String(v ?? "");
  };
  return {
    title: String(raw.title ?? "Research Brief"),
    summary: String(raw.summary ?? ""),
    keyFindings: toText(raw.keyFindings),
    trends: toText(raw.trends),
    outlook: String(raw.outlook ?? ""),
  };
}

function stripCodeFences(text: string): string {
  return text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
}

function extractJsonObject(text: string): Record<string, unknown> | null {
  const cleaned = stripCodeFences(text);
  try {
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    /* try substring extraction */
  }

  const start = cleaned.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (inString) {
      if (escape) escape = false;
      else if (ch === "\\") escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(cleaned.slice(start, i + 1)) as Record<string, unknown>;
        } catch {
          return null;
        }
      }
    }
  }

  return null;
}

const SYNTHESIS_SYSTEM = `You are a research analyst. Synthesize web search results into a structured brief.
Return ONLY a valid JSON object — no markdown, no backticks, no preamble.
Every value must be a JSON string (never an array). Use \\n for line breaks inside strings.
For keyFindings and trends, put bullet lines inside one string, each line starting with •
{
  "title": "Research Brief: [topic]",
  "summary": "2-3 sentence executive summary",
  "keyFindings": "• first finding\\n• second finding",
  "trends": "• first trend\\n• second trend",
  "outlook": "2-3 sentences on future implications and what to watch"
}`;

export async function POST(req: NextRequest) {
  const { topic } = await req.json();
  if (!topic || typeof topic !== "string" || !topic.trim()) {
    return new Response("No topic", { status: 400 });
  }

  if (!process.env.GROQ_API_KEY || !process.env.TAVILY_API_KEY) {
    return new Response("Missing API keys", { status: 500 });
  }

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
            {
              role: "user",
              content: `Topic: "${topic}"`,
            },
          ],
        });

        const planText = planCompletion.choices[0]?.message?.content || "[]";
        let queries: string[] = [];

        try {
          const match = planText.match(/\[[\s\S]*\]/);
          const parsed = JSON.parse(match ? match[0] : planText);
          if (Array.isArray(parsed)) {
            queries = parsed.map(String).filter(Boolean).slice(0, 6);
          }
        } catch {
          /* use fallback below */
        }

        if (queries.length === 0) {
          queries = [
            `${topic} overview 2025`,
            `${topic} latest news`,
            `${topic} challenges problems`,
            `${topic} data statistics`,
          ];
        }

        // Send queries to frontend so UI can show them
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

        // Collect all sources (deduplicated by URL)
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

        // Format context for synthesis (cap snippet length to avoid truncation)
        const clip = (s: string, max = 500) =>
          s.length <= max ? s : `${s.slice(0, max)}…`;

        const context = searchResults
          .map(
            ({ query, results }) =>
              `### Angle: ${query}\n` +
              (results.length === 0
                ? "No results."
                : results
                    .map(
                      (
                        r: { title: string; url: string; content: string },
                        i: number
                      ) =>
                        `[${i + 1}] ${r.title}\n${clip(r.content ?? "")}`
                    )
                    .join("\n\n"))
          )
          .join("\n\n---\n\n");

        // Step 3: Groq synthesizes everything
        send("status", { message: "Synthesizing across all sources..." });

        const userContent = `Topic: ${topic.trim()}\n\nResearch results from ${queries.length} angles:\n\n${context || "No search results found."}`;

        async function synthesizeBrief() {
          const completion = await groq.chat.completions.create({
            model: "llama-3.3-70b-versatile",
            temperature: 0.2,
            response_format: { type: "json_object" },
            messages: [
              { role: "system", content: SYNTHESIS_SYSTEM },
              { role: "user", content: userContent },
            ],
          });
          return completion.choices[0]?.message?.content ?? "";
        }

        let synthText = await synthesizeBrief();
        let parsed = extractJsonObject(synthText);

        if (!parsed) {
          synthText = await synthesizeBrief();
          parsed = extractJsonObject(synthText);
        }

        if (!parsed) {
          console.error("Groq synthesis parse failed:", synthText.slice(0, 500));
          send("error", { message: "Failed to parse brief" });
          controller.close();
          return;
        }

        const brief = normalizeBrief(parsed);

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
