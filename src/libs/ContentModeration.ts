/**
 * Minimal, blunt-instrument prompt filter — a stopgap so the platform never
 * silently generates the worst categories of harmful content while a proper
 * moderation pipeline isn't wired up yet.
 *
 * IMPORTANT — this is NOT a complete moderation solution. It only catches
 * exact keyword matches and will miss paraphrases, other languages, and
 * context. Before launch, replace/augment this with a real moderation API
 * (e.g. an LLM-based classifier, or a provider like Hive/OpenAI moderation)
 * that can be applied to both the prompt text and, ideally, the generated
 * output image/video itself.
 *
 * The list below intentionally focuses on the highest-severity categories
 * only (child sexual abuse material, and explicit non-consensual sexual
 * content) — the two categories where a keyword-level block is both cheap
 * and clearly better than nothing. It is deliberately not a general
 * profanity/violence filter.
 */

const BLOCKED_PATTERNS: RegExp[] = [
  /\bchild(ren)?\s+(porn|sex|nude|naked)/i,
  /\b(loli|shota)\b/i,
  /\bcp\s+(porn|sex)/i,
  /\bunderage\s+(porn|sex|nude|naked)/i,
  /\b(\d{1,2})\s*(yo|year[-\s]?old)\s+(nude|naked|porn|sex)/i,
  /\bnon[-\s]?consensual\b/i,
];

export function isPromptBlocked(prompt: string): boolean {
  return BLOCKED_PATTERNS.some(pattern => pattern.test(prompt));
}
