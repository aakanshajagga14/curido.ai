import Groq from "groq-sdk";
import { NextResponse } from "next/server";

interface TavilyResult {
  title: string;
  url: string;
  content?: string;
}

interface TavilyResponse {
  results?: TavilyResult[];
}

interface ResearchBrief {
  title: string;
  summary: string;
  keyFindings: string;
  trends: string;
  outlook: string;
}

function toBulletString(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        const text = String(item).trim();
        return text.startsWith("•") ? text : `• ${text}`;
      })
      .join("\n");
  }
  return String(value ?? "");
}

function normalizeBrief(raw: Record<string, unknown>): ResearchBrief {
  return {
    title: String(raw.title ?? "Research Brief"),
    summary: String(raw.summary ?? ""),
    keyFindings: toBulletString(raw.keyFindings),
    trends: toBulletString(raw.trends),
    outlook: String(raw.outlook ?? ""),
  };
}

const SYSTEM_PROMPT = `You are a research analyst. Synthesize web search results into a structured brief.
Return ONLY a valid JSON object — no markdown, no backticks, no preamble.
Every value must be a JSON string (never an array). Use \\n for line breaks inside strings.
For keyFindings and trends, put 4-6 (or 3-5) bullet lines inside one string, each line starting with •
{
  "title": "Research Brief: [topic]",
  "summary": "2-3 sentence executive summary",
  "keyFindings": "• first finding\\n• second finding",
  "trends": "• first trend\\n• second trend",
  "outlook": "2-3 sentences on future implications and what to watch"
}`;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const topic = body?.topic;

    if (!topic || typeof topic !== "string" || !topic.trim()) {
      return NextResponse.json(
        { error: "Missing topic in request body" },
        { status: 400 }
      );
    }

    const tavilyKey = process.env.TAVILY_API_KEY;
    const groqKey = process.env.GROQ_API_KEY;

    if (!tavilyKey || !groqKey) {
      return NextResponse.json(
        { error: "Server configuration error: missing API keys" },
        { status: 500 }
      );
    }

    let tavilyData: TavilyResponse;
    try {
      const tavilyRes = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: tavilyKey,
          query: topic.trim(),
          search_depth: "advanced",
          max_results: 8,
          include_answer: true,
          include_raw_content: false,
        }),
      });

      if (!tavilyRes.ok) {
        const errText = await tavilyRes.text();
        console.error("Tavily API error:", tavilyRes.status, errText);
        return NextResponse.json(
          { error: "Web search failed" },
          { status: 500 }
        );
      }

      tavilyData = (await tavilyRes.json()) as TavilyResponse;
    } catch (err) {
      console.error("Tavily request error:", err);
      return NextResponse.json(
        { error: "Web search failed" },
        { status: 500 }
      );
    }

    const results = tavilyData.results ?? [];
    const sources = results.map((r) => ({ title: r.title, url: r.url }));

    const formattedResults = results
      .map((r, i) => {
        const snippet = r.content ?? "";
        return `[${i + 1}] ${r.title}\nURL: ${r.url}\n${snippet}`;
      })
      .join("\n\n");

    const groq = new Groq({ apiKey: groqKey });

    let brief: ResearchBrief;
    try {
      const completion = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        temperature: 0.3,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: `Topic: ${topic.trim()}\n\nWeb search results:\n${formattedResults || "No results found."}`,
          },
        ],
      });

      const rawContent = completion.choices[0]?.message?.content ?? "";
      const jsonMatch = rawContent.match(/\{[\s\S]*\}/);

      if (!jsonMatch) {
        console.error("Groq response missing JSON:", rawContent);
        return NextResponse.json(
          { error: "Failed to parse research brief" },
          { status: 500 }
        );
      }

      try {
        const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
        brief = normalizeBrief(parsed);
      } catch (parseErr) {
        console.error("JSON parse error:", parseErr, rawContent);
        return NextResponse.json(
          { error: "Failed to parse research brief" },
          { status: 500 }
        );
      }
    } catch (err) {
      console.error("Groq request error:", err);
      return NextResponse.json(
        { error: "AI synthesis failed" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ...brief, sources });
  } catch (err) {
    console.error("Research route error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
