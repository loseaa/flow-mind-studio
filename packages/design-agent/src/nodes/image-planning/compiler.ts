import { designDocumentSchema, type DesignDocument, type JsonValue } from "@flowmind/shared";

import { visualAssetPlanSchema, type VisualAssetPlan } from "./schema.js";

export function compileVisualAssetPlan(document: DesignDocument, input: VisualAssetPlan): DesignDocument {
  const plan = visualAssetPlanSchema.parse(input);
  const compiled = structuredClone(document) as DesignDocument;
  const assetsByTarget = new Map(plan.assets.map((asset) => [asset.targetElementId, asset]));

  compiled.elements = compiled.elements.map((element) => {
    const asset = assetsByTarget.get(element.id);
    if (!asset) return element;
    if (element.props.imageSlotId !== asset.slotId) {
      throw new Error(`Visual asset ${asset.id} target does not own slot ${asset.slotId}.`);
    }
    return {
      ...element,
      props: {
        ...element.props,
        visualAssetId: asset.id,
        visualAssetKind: asset.kind,
        visualAssetRole: asset.role,
        purpose: asset.purpose,
        promptBrief: asset.promptBrief,
        requestedWidth: asset.width,
        requestedHeight: asset.height,
        generationPriority: asset.priority,
        ...(asset.kind === "background_image" ? { foregroundTone: asset.foregroundTone } : {}),
      },
    };
  });

  for (const asset of plan.assets) {
    if (!compiled.elements.some((element) => element.id === asset.targetElementId)) {
      throw new Error(`Image slot target does not exist: ${asset.targetElementId}`);
    }
  }
  compiled.variables = { ...compiled.variables, visualAssets: toJsonValue(plan) };
  return designDocumentSchema.parse(compiled);
}

function toJsonValue(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}