import { SUPPORTED_EMOJI } from "./emojiLibrary.js";

export interface RawCandidate {
  startTimestamp: string;
  endTimestamp: string;
  score: number;
  hook: string;
  tag: string;
  emoji: string;
}

// Shared between clients/anthropic.ts and clients/groqChat.ts — both
// providers score the same prompt against the same schema, so the analyze
// step (and its output quality) doesn't change when ANALYZE_PROVIDER flips.
//
// topicFilter is a per-project, user-supplied hard requirement (e.g. "Must
// show Anton and/or Lovable — don't clip parts of the podcast that aren't
// about Lovable") — it's a *filter* layered on top of scoring, not a
// rewording of it: a moment can be a great standalone clip and still get
// rejected here for being off-topic.
export function buildScoringSystemPrompt(topicFilter?: string | null): string {
  const filterSection = topicFilter?.trim()
    ? `\n\nHARD REQUIREMENT (this overrides everything else — reject a moment that fails this even if it would otherwise be a great clip): ${topicFilter.trim()}\n`
    : "";

  return `You are analyzing one chunk of a timestamped transcript from a long-form video or podcast for Cutroom, a tool that turns long videos into short vertical clips (TikTok/Shorts/Reels).

The transcript is formatted as repeated "[m:ss] words..." lines, where each [m:ss] marks the timestamp of the words that follow it, up to the next marker.
${filterSection}
Find 0-4 self-contained moments in THIS chunk that would work as a standalone 15-90 second vertical clip — a complete story, a strong opinion, a specific tactic, a surprising stat, or a clear lesson. Skip filler, rambling, or moments that need earlier context to make sense.

For each moment:
- startTimestamp / endTimestamp: "m:ss" strings. Use a marker time from the transcript for the start, and end where the thought actually completes (don't cut off mid-sentence).
- score: 0-100, how likely this specific clip is to perform well as a short-form video on its own.
- hook: a punchy, curiosity-driving first line for the clip, under 12 words, in the speaker's voice. Not a description of the clip — a hook a viewer would see as on-screen text. This also becomes the clip's header caption, so it must stand alone.
- tag: one word describing the moment type — e.g. Story, Lesson, Tactic, Insight, Teardown, Hot Take.
- emoji: pick the single best-fitting emoji from this exact list (copy it exactly, don't substitute a different one): ${SUPPORTED_EMOJI.join(" ")}

If nothing in this chunk is clip-worthy${topicFilter?.trim() ? ", or nothing satisfies the hard requirement above," : ""} submit an empty candidates array.`;
}

export const CANDIDATE_TOOL_NAME = "submit_clip_candidates";
export const CANDIDATE_TOOL_DESCRIPTION = "Submit scored viral-moment clip candidates found in this transcript chunk.";

export const CANDIDATE_JSON_SCHEMA = {
  type: "object",
  properties: {
    candidates: {
      type: "array",
      items: {
        type: "object",
        properties: {
          startTimestamp: { type: "string", description: 'e.g. "12:34"' },
          endTimestamp: { type: "string", description: 'e.g. "13:20"' },
          score: { type: "number" },
          hook: { type: "string" },
          tag: { type: "string" },
          emoji: { type: "string", enum: SUPPORTED_EMOJI },
        },
        required: ["startTimestamp", "endTimestamp", "score", "hook", "tag", "emoji"],
        additionalProperties: false,
      },
    },
  },
  required: ["candidates"],
  additionalProperties: false,
};
