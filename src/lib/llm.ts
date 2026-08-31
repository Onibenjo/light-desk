// One tiny abstraction so the search model can be swapped from the env alone.
//
//   LLM_PROVIDER=openrouter  (default)  one key, any model: LLM_API_KEY (sk-or-…), LLM_MODEL
//   LLM_PROVIDER=anthropic              direct: ANTHROPIC_API_KEY, LLM_MODEL (or ANTHROPIC_MODEL)
//   LLM_PROVIDER=openai                 any OpenAI-compatible chat endpoint:
//                                       OpenAI, Groq, Gemini (OpenAI-compat URL), OpenRouter,
//                                       Mistral, DeepSeek, or a local Ollama/LM Studio server.
//                                       Uses LLM_API_KEY, LLM_MODEL, LLM_BASE_URL
//
// The interface is deliberately minimal: system + user in, text out. Nothing
// else in the app knows which provider is behind it.

import Anthropic from "@anthropic-ai/sdk";

export interface LlmRequest {
  system: string;
  user: string;
  maxTokens?: number;
}

export async function complete(req: LlmRequest): Promise<string> {
  const provider = (process.env.LLM_PROVIDER ?? "openrouter").toLowerCase();
  if (provider === "openrouter") return completeOpenAI(req, { base: "https://openrouter.ai/api/v1", defaultModel: "anthropic/claude-haiku-4.5", keyEnv: "OPENROUTER_API_KEY" });
  if (provider === "openai" || provider === "openai-compatible") return completeOpenAI(req);
  if (provider === "anthropic") return completeAnthropic(req);
  throw new Error(`Unknown LLM_PROVIDER "${provider}" (use openrouter, anthropic or openai)`);
}

async function completeAnthropic(req: LlmRequest): Promise<string> {
  const apiKey = process.env.LLM_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY (or LLM_API_KEY) is not set");
  const model = process.env.LLM_MODEL || process.env.ANTHROPIC_MODEL || "claude-haiku-4-5";
  const client = new Anthropic({ apiKey, baseURL: process.env.LLM_BASE_URL || undefined });
  const res = await client.messages.create({
    model,
    max_tokens: req.maxTokens ?? 300,
    system: req.system,
    messages: [{ role: "user", content: req.user }],
  });
  return res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}

async function completeOpenAI(req: LlmRequest, preset?: { base: string; defaultModel: string; keyEnv: string }): Promise<string> {
  const apiKey = process.env.LLM_API_KEY || (preset ? process.env[preset.keyEnv] : process.env.OPENAI_API_KEY);
  const base = (process.env.LLM_BASE_URL || preset?.base || "https://api.openai.com/v1").replace(/\/$/, "");
  const model = process.env.LLM_MODEL || preset?.defaultModel || "gpt-4o-mini";
  if (!apiKey && !/localhost|127\.0\.0\.1/.test(base)) throw new Error(`${preset?.keyEnv ?? "OPENAI_API_KEY"} (or LLM_API_KEY) is not set`);
  const isOpenRouter = base.includes("openrouter.ai");
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      // OpenRouter shows these on its dashboard; harmless elsewhere.
      ...(isOpenRouter ? { "HTTP-Referer": "https://lightdesk.church", "X-Title": "Lightdesk" } : {}),
    },
    body: JSON.stringify({
      model,
      max_tokens: req.maxTokens ?? 300,
      temperature: 0,
      messages: [
        { role: "system", content: req.system },
        { role: "user", content: req.user },
      ],
    }),
  });
  if (!res.ok) throw new Error(`LLM HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return data.choices?.[0]?.message?.content ?? "";
}
