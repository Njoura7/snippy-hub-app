import Anthropic from "@anthropic-ai/sdk";
import {
  buildScoringSystemPrompt,
  CANDIDATE_JSON_SCHEMA,
  CANDIDATE_TOOL_NAME,
  CANDIDATE_TOOL_DESCRIPTION,
  type RawCandidate,
} from "./scoringPrompt.js";

const MODEL = "claude-haiku-4-5";

const CANDIDATE_TOOL: Anthropic.Tool = {
  name: CANDIDATE_TOOL_NAME,
  description: CANDIDATE_TOOL_DESCRIPTION,
  // CANDIDATE_JSON_SCHEMA is shared with the Groq client's looser `parameters`
  // field, so it's typed as a plain object rather than the SDK's literal-`"object"`-typed InputSchema.
  input_schema: CANDIDATE_JSON_SCHEMA as Anthropic.Tool["input_schema"],
  // Not using `strict: true` — that requires the beta client in this SDK
  // version. Forced tool_choice below is already reliable in practice;
  // toClipCandidate() in analyze.ts validates/drops anything malformed.
};

/** Paid — needs real credits on the Anthropic account (Console > Plans & Billing). */
export async function scoreTranscriptChunkAnthropic(
  chunkText: string,
  apiKey: string,
  topicFilter?: string | null,
): Promise<RawCandidate[]> {
  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: buildScoringSystemPrompt(topicFilter),
    tools: [CANDIDATE_TOOL],
    tool_choice: { type: "tool", name: CANDIDATE_TOOL_NAME },
    messages: [{ role: "user", content: chunkText }],
  });

  const toolUse = response.content.find((block): block is Anthropic.ToolUseBlock => block.type === "tool_use");
  if (!toolUse) return [];

  const input = toolUse.input as { candidates: RawCandidate[] };
  return input.candidates ?? [];
}
