import {
  designDocumentSchema,
  type DesignDocument,
  type DesignElement,
} from "@flowmind/shared";

import { stylePlanSchema, type StylePlan, type StylePreset } from "./schema.js";
export function repairStylePlan(document: DesignDocument, input: StylePlan): StylePlan {
  const plan = stylePlanSchema.parse(input);
  const elementsById = new Map(document.elements.map((element) => [element.id, element]));
  const repairs: string[] = [];
  const assignments = plan.assignments.flatMap((assignment) => {
    const element = elementsById.get(assignment.elementId);
    if (!element || isCompatiblePreset(element, assignment.preset)) return [assignment];

    const replacement = defaultStylePreset(element);
    if (!replacement) {
      repairs.push(`Removed incompatible preset ${assignment.preset} from ${element.id} (${element.type}).`);
      return [];
    }
    repairs.push(`Replaced incompatible preset ${assignment.preset} with ${replacement} for ${element.id} (${element.type}).`);
    return [{ ...assignment, preset: replacement }];
  });

  const repairNotes = repairs.slice(0, 10);
  return stylePlanSchema.parse({
    ...plan,
    assignments,
    notes: [...plan.notes.slice(0, 10 - repairNotes.length), ...repairNotes],
  });
}

export function compileStylePlan(document: DesignDocument, input: StylePlan): DesignDocument {
  const plan = stylePlanSchema.parse(input);
  const assignments = new Map(plan.assignments.map((assignment) => [assignment.elementId, assignment.preset]));
  const elementsById = new Map(document.elements.map((element) => [element.id, element]));

  for (const assignment of plan.assignments) {
    if (!elementsById.has(assignment.elementId)) {
      throw new Error(`Missing style element: ${assignment.elementId}`);
    }
  }

  return designDocumentSchema.parse({
    ...document,
    elements: document.elements.map((element) => {
      const preset = assignments.get(element.id);
      return preset ? applyPreset(element, preset) : element;
    }),
    variables: {
      ...document.variables,
      designTheme: { theme: plan.theme, tone: plan.tone },
    },
  });
}

function applyPreset(element: DesignElement, preset: StylePreset): DesignElement {
  if (preset === "page" || preset === "section" || preset === "panel") {
    if (element.type !== "page" && element.type !== "section" && element.type !== "stack") {
      return incompatible(element, preset);
    }
    return {
      ...element,
      style: {
        ...element.style,
        base: {
          ...element.style.base,
          backgroundColor: preset === "page" ? "muted" : "white",
          radius: preset === "page" ? "none" : "md",
          border: preset === "panel"
            ? { width: "sm", style: "solid", color: "border" }
            : { width: "none", style: "none", color: "border" },
        },
        container: {
          ...element.style.container,
          shadow: preset === "panel" ? "sm" : "none",
          surface: preset === "page" ? "flat" : preset === "panel" ? "panel" : "flat",
        },
      },
    };
  }

  if (preset === "heading" || preset === "subheading" || preset === "body" || preset === "muted") {
    if (element.type !== "text") return incompatible(element, preset);
    const heading = preset === "heading";
    return {
      ...element,
      style: {
        ...element.style,
        base: {
          ...element.style.base,
          text: {
            ...element.style.base.text,
            color: preset === "muted" ? "textSecondary" : "textPrimary",
            fontSize: heading ? "2xl" : preset === "subheading" ? "lg" : preset === "muted" ? "sm" : "md",
            fontWeight: heading ? "bold" : preset === "subheading" ? "semibold" : "regular",
            lineHeight: heading ? "tight" : "normal",
          },
        },
        text: {
          ...element.style.text,
          role: heading ? "heading" : preset === "subheading" ? "subheading" : preset === "muted" ? "caption" : "body",
        },
      },
    };
  }

  if (preset === "media") {
    if (element.type !== "image") return incompatible(element, preset);
    return { ...element, style: { ...element.style, base: { ...element.style.base, radius: "md" } } };
  }

  if (preset === "primary_action" || preset === "secondary_action") {
    if (element.type !== "button") return incompatible(element, preset);
    const primary = preset === "primary_action";
    return {
      ...element,
      style: {
        ...element.style,
        base: {
          ...element.style.base,
          backgroundColor: primary ? "brand" : "white",
          border: primary
            ? { width: "none", style: "none", color: "border" }
            : { width: "sm", style: "solid", color: "border" },
          text: { ...element.style.base.text, color: primary ? "white" : "brand", fontWeight: "semibold" },
        },
        button: { ...element.style.button, emphasis: primary ? "primary" : "secondary" },
      },
    };
  }

  if (preset === "control") {
    if (element.type !== "input" && element.type !== "filter" && element.type !== "form") {
      return incompatible(element, preset);
    }
    return { ...element, style: { ...element.style, control: { ...element.style.control, fieldGap: "sm" } } };
  }

  if (preset === "status") {
    if (element.type !== "badge") return incompatible(element, preset);
    return { ...element, style: { ...element.style, badge: { ...element.style.badge, emphasis: "soft" } } };
  }

  if (preset === "metric") {
    if (element.type !== "stat") return incompatible(element, preset);
    return { ...element, style: { ...element.style, stat: { ...element.style.stat, valueSize: "xl" } } };
  }

  if (element.type !== "table") return incompatible(element, preset);
  return {
    ...element,
    style: {
      ...element.style,
      table: { ...element.style.table, density: "compact", zebra: true, borderMode: "rows" },
    },
  };
}

function isCompatiblePreset(element: DesignElement, preset: StylePreset) {
  if (element.type === "page" || element.type === "section" || element.type === "stack") {
    return preset === "page" || preset === "section" || preset === "panel";
  }
  if (element.type === "text") return preset === "heading" || preset === "subheading" || preset === "body" || preset === "muted";
  if (element.type === "image") return preset === "media";
  if (element.type === "button") return preset === "primary_action" || preset === "secondary_action";
  if (element.type === "input" || element.type === "filter" || element.type === "form") return preset === "control";
  if (element.type === "badge") return preset === "status";
  if (element.type === "stat") return preset === "metric";
  if (element.type === "table") return preset === "data_table";
  return false;
}

function defaultStylePreset(element: DesignElement): StylePreset | undefined {
  if (element.type === "page") return "page";
  if (element.type === "section") return "section";
  if (element.type === "stack") return "panel";
  if (element.type === "text") return "body";
  if (element.type === "image") return "media";
  if (element.type === "button") return "secondary_action";
  if (element.type === "input" || element.type === "filter" || element.type === "form") return "control";
  if (element.type === "badge") return "status";
  if (element.type === "stat") return "metric";
  if (element.type === "table") return "data_table";
  return undefined;
}

function incompatible(element: DesignElement, preset: StylePreset): never {
  throw new Error(`Incompatible style preset ${preset} for element ${element.id} (${element.type})`);
}
