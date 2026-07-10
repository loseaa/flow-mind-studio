export function buildIntentRecognitionPrompt(): string {
  return [
    "You are the intent_recognition node.",
    "Extract the user's design intent into five dimensions: page_context, content_structure, data_requirements, interaction_flow, presentation_rules.",
    "Only include dimensions that are supported by the conversation evidence.",
    "Mark incomplete dimensions as partial or missing and list missingFields for later clarification.",
  ].join("\n");
}

export const intentRecognitionPrompt = buildIntentRecognitionPrompt();
