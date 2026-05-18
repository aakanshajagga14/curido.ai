import Groq from "groq-sdk";
import { NextRequest } from "next/server";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

function normalizeBrief(raw: Record<string, unknown>) {
  const toText = (v: unknown) =>
    Array.isArray(v)
      ? v.map((x) => String(x).trim()).filter(Boolean).join("\n")
      : String(v ?? "");
  return {
    title: String(raw.title ?? "Research Brief"),
    summary: String(raw.summary ?? ""),
    keyFindings: toText(raw.keyFindings),
    trends: toText(raw.trends),
    outlook: String(raw.outlook ?? ""),
  };
}

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

        // Format context for synthesis
        const context = searchResults
          .map(
            ({ query, results }) =>
              `### Angle: ${query}\n` +
              results
                .map((r: { title: string; url: string; content: string }, i: number) => `[${i + 1}] ${r.title}\n${r.content}`)
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
              content: `You are a research analyst. You have been given search results from multiple research angles. Synthesize them into a comprehensive brief.
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
              content: `Topic: "${topic}"\n\nResearch results from ${queries.length} angles:\n\n${context}`,
            },
          ],
        });

        const synthText = synthesis.choices[0]?.message?.content || "";

        let brief;
        try {
          const match = synthText.match(/\{[\s\S]*\}/);
          brief = normalizeBrief(
            JSON.parse(match ? match[0] : synthText) as Record<string, unknown>
          );
        } catch {
          send("error", { message: "Failed to parse brief" });
          controller.close();
          return;
        }

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
