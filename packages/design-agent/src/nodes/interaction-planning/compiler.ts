import {
  designDocumentSchema,
  type DesignDocument,
  type JsonValue,
} from "@flowmind/shared";

import { interactionPlanSchema, type InteractionPlan } from "./schema.js";

export function compileInteractionPlan(
  document: DesignDocument,
  input: InteractionPlan,
): DesignDocument {
  const plan = interactionPlanSchema.parse(input);
  const elementIds = new Set(document.elements.map((element) => element.id));

  const interactions = plan.interactions.map((interaction) => {
    if (!elementIds.has(interaction.sourceElementId)) {
      throw new Error(`Missing source element: ${interaction.sourceElementId}`);
    }
    if (interaction.targetElementId && !elementIds.has(interaction.targetElementId)) {
      throw new Error(`Missing target element: ${interaction.targetElementId}`);
    }

    return {
      ...interaction,
      payload: Object.fromEntries(
        interaction.payload.map(({ key, value }) => [key, value]),
      ) as Record<string, JsonValue>,
    };
  });

  return designDocumentSchema.parse({
    ...document,
    variables: {
      ...document.variables,
      interactions,
    },
  });
}
