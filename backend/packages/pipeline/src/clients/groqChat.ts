import {
  buildScoringSystemPrompt,
  CANDIDATE_JSON_SCHEMA,
  CANDIDATE_TOOL_DESCRIPTION,
  CANDIDATE_TOOL_NAME,
  type RawCandidate,
} from "./scoringPrompt.js";

// Free-tier, tool-calling-capable model. Groq's lineup shifts — if this 404s
// with "model_not_found", check what's actually enabled for the account:
// curl https://api.groq.com/openai/v1/models -H "Authorization: Bearer $GROQ_API_KEY"
const MODEL = "openai/gpt-oss-120b";

interface GroqChatResponse {
  choices: {
    message: {
      tool_calls?: { function: { name: string; arguments: string } }[];
    };
  }[];
}

/** Free — reuses GROQ_API_KEY, no separate signup. Groq's chat completions
 * endpoint is OpenAI-compatible: console.groq.com/docs/api-reference#chat-create */
export async function scoreTranscriptChunkGroq(
  chunkText: string,
  apiKey: string,
  topicFilter?: string | null,
): Promise<RawCandidate[]> {
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: buildScoringSystemPrompt(topicFilter) },
        { role: "user", content: chunkText },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: CANDIDATE_TOOL_NAME,
            description: CANDIDATE_TOOL_DESCRIPTION,
            parameters: CANDIDATE_JSON_SCHEMA,
          },
        },
      ],
      tool_choice: { type: "function", function: { name: CANDIDATE_TOOL_NAME } },
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Groq chat completion failed (${response.status}): ${body.slice(0, 500)}`);
  }

  const data = (await response.json()) as GroqChatResponse;
  const toolCall = data.choices[0]?.message.tool_calls?.[0];
  if (!toolCall) return [];

  const parsed = JSON.parse(toolCall.function.arguments) as { candidates: RawCandidate[] };
  return parsed.candidates ?? [];
}
