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
    if (!element) {
      repairs.push(`Removed style assignment for missing element ${assignment.elementId}.`);
      return [];
    }
    if (isCompatiblePreset(element, assignment.preset)) {
      const expected = defaultStylePreset(element);
      if ((element.type === "text" || element.type === "link" || element.type === "button") && expected && expected !== assignment.preset) {
        repairs.push(`Replaced semantically weak preset ${assignment.preset} with ${expected} for ${element.id}.`);
        return [{ ...assignment, preset: expected }];
      }
      return [assignment];
    }

    const replacement = defaultStylePreset(element);
    if (!replacement) {
      repairs.push(`Removed incompatible preset ${assignment.preset} from ${element.id} (${element.type}).`);
      return [];
    }
    repairs.push(`Replaced incompatible preset ${assignment.preset} with ${replacement} for ${element.id} (${element.type}).`);
    return [{ ...assignment, preset: replacement }];
  });

  const assignedIds = new Set(assignments.map((assignment) => assignment.elementId));
  for (const element of document.elements) {
    if (assignedIds.has(element.id)) continue;
    const preset = defaultStylePreset(element);
    if (!preset) continue;
    assignments.push({ elementId: element.id, preset });
    repairs.push(`Added missing preset ${preset} for ${element.id} (${element.type}).`);
  }

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
          overflow: element.id === "table_content" ? "auto" : element.style.container.overflow,
          surface: preset === "page" ? "flat" : preset === "panel" ? "panel" : "flat",
        },
      },
    };
  }

  if (preset === "heading" || preset === "subheading" || preset === "body" || preset === "muted") {
    if (element.type !== "text" && element.type !== "link") return incompatible(element, preset);
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
    if (element.type === "image") return { ...element, style: { ...element.style, base: { ...element.style.base, radius: "md" } } };
    if (element.type === "avatar") return { ...element, style: { ...element.style, base: { ...element.style.base, radius: "md" } } };
    return incompatible(element, preset);
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
    if (
      element.type !== "input" && element.type !== "textarea" && element.type !== "select" &&
      element.type !== "checkbox" && element.type !== "radio" && element.type !== "switch" &&
      element.type !== "filter" && element.type !== "form"
    ) {
      return incompatible(element, preset);
    }
    return { ...element, style: { ...element.style, control: { ...element.style.control, fieldGap: "sm" } } };
  }

  if (preset === "status") {
    if (element.type !== "badge") return incompatible(element, preset);
    return { ...element, style: { ...element.style, badge: { ...element.style.badge, emphasis: "soft" } } };
  }

  if (preset === "metric") {
    if (element.type === "stat") return { ...element, style: { ...element.style, stat: { ...element.style.stat, valueSize: "xl" } } };
    if (element.type === "progress") return { ...element, style: { ...element.style, progress: { ...element.style.progress, showValue: true } } };
    return incompatible(element, preset);
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
  if (element.type === "text" || element.type === "link") return preset === "heading" || preset === "subheading" || preset === "body" || preset === "muted";
  if (element.type === "image" || element.type === "avatar") return preset === "media";
  if (element.type === "button") return preset === "primary_action" || preset === "secondary_action";
  if (["input", "textarea", "select", "checkbox", "radio", "switch", "filter", "form"].includes(element.type)) return preset === "control";
  if (element.type === "badge") return preset === "status";
  if (element.type === "stat" || element.type === "progress") return preset === "metric";
  if (element.type === "table") return preset === "data_table";
  return false;
}

function defaultStylePreset(element: DesignElement): StylePreset | undefined {
  if (element.type === "page") return "page";
  if (element.type === "section") return "section";
  if (element.type === "stack") return "panel";
  if (element.type === "text" || element.type === "link") {
    const hint = `${element.id} ${element.name} ${String(element.props.purpose ?? "")}`.toLowerCase();
    if (/(page|hero|header|main)[_\s-]?(title|headline)/.test(hint)) return "heading";
    if (/(^|[_\s-])(title|heading)([_\s-]|$)/.test(hint)) return "subheading";
    if (/eyebrow|caption|description|helper|note/.test(hint)) return "muted";
    return "body";
  }
  if (element.type === "image" || element.type === "avatar") return "media";
  if (element.type === "button") {
    return inferButtonPreset(element);
  }
  if (["input", "textarea", "select", "checkbox", "radio", "switch", "filter", "form"].includes(element.type)) return "control";
  if (element.type === "badge") return "status";
  if (element.type === "stat" || element.type === "progress") return "metric";
  if (element.type === "table") return "data_table";
  return undefined;
}

function inferButtonPreset(element: DesignElement): StylePreset {
  const identity = `${element.id} ${element.name} ${String(element.props.label ?? "")} ${String(element.props.purpose ?? "")}`.toLowerCase();
  if (/secondary|cancel|back|close|learn|contact|more|details|explore|view|browse|咨询|联系|了解|更多|查看/.test(identity)) {
    return "secondary_action";
  }
  if (/primary|submit|create|save|confirm|buy|start|shop|cart|checkout|order|add|purchase|立即|马上|开始|购买|选购|下单|结算|加入购物车|购物车/.test(identity)) {
    return "primary_action";
  }
  return "secondary_action";
}

function incompatible(element: DesignElement, preset: StylePreset): never {
  throw new Error(`Incompatible style preset ${preset} for element ${element.id} (${element.type})`);
}
