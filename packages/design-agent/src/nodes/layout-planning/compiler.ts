import { designDocumentSchema, designLayoutSchema, type DesignDocument } from "@flowmind/shared";

import type { LayoutPlan } from "./schema.js";

export function compileLayoutPlan(document: DesignDocument, plan: LayoutPlan): DesignDocument {
  const assignments = plan.containerLayouts ?? [];
  const elementsById = new Map(document.elements.map((element) => [element.id, element]));
  const seen = new Set<string>();

  for (const assignment of assignments) {
    if (seen.has(assignment.elementId)) throw new Error(`Duplicate container layout: ${assignment.elementId}`);
    seen.add(assignment.elementId);
    const element = elementsById.get(assignment.elementId);
    if (!element || !["page", "section", "stack"].includes(element.type)) {
      throw new Error(`Container layout target is invalid: ${assignment.elementId}`);
    }
    designLayoutSchema.parse(assignment.layout);
  }

  return designDocumentSchema.parse({
    ...document,
    elements: document.elements.map((element) => {
      const assignment = assignments.find((candidate) => candidate.elementId === element.id);
      if (!assignment) return element;
      return { ...element, layout: { ...element.layout, ...assignment.layout } };
    }),
  });
}

