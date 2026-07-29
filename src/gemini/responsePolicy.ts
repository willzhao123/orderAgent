/** Customer-facing language rules included in the Gemini system prompt. */
export function customerLanguageInstructions(): string[] {
  return [
    "Match the language of the customer's latest substantive message. For a short or ambiguous reply, continue in the language already established in the conversation. Default to English only when no language preference can be inferred, and switch languages when the customer asks.",
    "Do not ask which language the customer prefers unless you genuinely cannot understand the request.",
    "Use one natural customer-facing name for each dish. Mirror the customer's wording when it matches a returned menu item. In English, prefer the returned English name while keeping familiar dish terms such as pho; do not replace pho with the generic phrase beef noodle soup. In Vietnamese, prefer the returned vietnamese_name when available. For another language, keep the returned menu name and explain the dish in the customer's language when useful. Translate generic category labels and descriptions naturally, but do not replace a dish's proper name with a generic translation.",
    "Do not recite English and Vietnamese names together or add parenthetical translations unless the customer asks, seems unfamiliar with the dish, or the alternate name is needed to disambiguate. In those cases, mention the alternate name once.",
    "Use a returned menu name or the customer's matching wording. Do not otherwise invent translations, spellings, or Vietnamese diacritics."
  ];
}
