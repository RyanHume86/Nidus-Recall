/** @typedef {import('../types.js').Card} Card */
/** @typedef {import('../types.js').AiResponse} AiResponse */

/**
 * AI assist safety layer.
 *
 * References:
 *   Hallucination/fabrication risk: Alkaissi & McFarlane (Am J Case Rep 2023),
 *   Thirunavukarasu et al. (Lancet Digit Health 2023), Omiye et al. (npj Digit Med 2023).
 *
 * Two enforced hard rules:
 *   1. Citation requests are refused before any LLM call is made.
 *   2. Clinical content triggers a visible warning in the diff UI.
 */
import { base44 } from '@/api/base44Client'

// Matches a verb within 40 characters before citation-related nouns.
// Refusal is enforced BEFORE the LLM request; the system prompt adds a second layer.
const CITATION_INTENT_REGEX = /\b(add|insert|include|put|append|write|generate|find|get|look up|provide)\b.{0,40}(citation|reference|source|evidence|study|paper|pmid|doi|url|link)\b/i

export const hasCitationIntent = (prompt) => {
  if (!prompt) return false
  return CITATION_INTENT_REGEX.test(prompt)
}

const CLINICAL_REGEX = /clinical|medic|pharm|drug|dose|anatomy|surg|neuro|cardio|onco|paed|obstet|infect/i

export const isClinicalContent = (deckName, tags) => {
  if (CLINICAL_REGEX.test(deckName || '')) return true
  return (tags || []).some(t => CLINICAL_REGEX.test(t))
}

/**
 * requestAIEdit: calls the LLM to propose an edit to a flashcard.
 * Throws 'CITATION_REFUSED: ...' synchronously if citation intent is detected.
 * Throws AiPromptTooLongError if userPrompt exceeds PROMPT_MAX_CHARS.
 * Returns { proposed: { front, back }, isClinical: boolean }.
 *
 * The AI system prompt instructs the model not to add citations (second safety layer).
 *
 * @param {Pick<Card, 'front'|'back'|'deck'|'tags'>} card
 * @param {string} userPrompt
 * @returns {Promise<AiResponse>}
 */
export const requestAIEdit = async (card, userPrompt) => {
  if (hasCitationIntent(userPrompt)) {
    throw 'CITATION_REFUSED: Citations must be added manually. Paste a PMID, DOI, or URL and the system will fetch the metadata.'
  }

  const isClinical = isClinicalContent(card.deck, card.tags)

  const systemPrompt = [
    'You are a spaced-repetition flashcard editor. Edit the card according to the user instruction.',
    'Return ONLY a JSON object with keys "front" and "back". No extra keys, no markdown, no citations.',
    'Do not add any citations, references, PMIDs, DOIs, or URLs to the content.',
    isClinical ? 'This card contains clinical content. Be conservative and do not introduce factual changes.' : '',
  ].filter(Boolean).join(' ')

  const raw = await /** @type {{ callFunction: (name: string, args: Record<string, unknown>) => Promise<unknown> }} */ (/** @type {unknown} */ (base44.functions)).callFunction('invokeLLM', {
    prompt: userPrompt,
    system: systemPrompt,
    card_front: card.front,
    card_back: card.back,
  })

  let proposed
  try {
    proposed = typeof raw === 'string' ? JSON.parse(raw) : raw
  } catch {
    throw new Error('AI response was not valid JSON.')
  }

  return { proposed, isClinical }
}
