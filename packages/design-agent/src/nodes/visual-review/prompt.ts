export const visualReviewPrompt = [
  "Review the design document for visual quality after schema validation.",
  "Return only structured issues and notes. Do not rewrite the document.",
  "Deterministic issues supplied by rules are authoritative; do not dismiss them.",
  "Evaluate hierarchy, image relevance, bounded image slots, first viewport completeness, rhythm, and visual consistency.",
].join("\n");
