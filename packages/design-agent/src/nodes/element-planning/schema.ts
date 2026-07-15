import type { DesignDocument } from "@flowmind/shared";
import { z } from "zod";
const semanticAttributeValueSchema = z.union([
  z.string().max(1000),
  z.number(),
  z.boolean(),
  z.array(z.string().max(200)).max(10),
]);

export const semanticElementSchema = z.object({
  id: z.string().min(1),
  parentId: z.string().min(1),
  order: z.number().int().nonnegative(),
  type: z.enum([
    "text",
    "image",
    "button",
    "input",
    "filter",
    "form",
    "badge",
    "divider",
    "stat",
    "table",
  ]),
  name: z.string().min(1),
  purpose: z.string().min(1).max(500),
  content: z.string().max(2000).optional(),
  attributes: z.array(z.object({
    key: z.string().min(1).max(100),
    value: semanticAttributeValueSchema,
  }).strict()).max(12),
}).strict();

export const semanticElementPlanSchema = z.object({
  elements: z.array(semanticElementSchema).max(80),
  notes: z.array(z.string().min(1).max(500)).max(10),
}).strict().superRefine((plan, context) => {
  const seen = new Set<string>();
  for (const [index, element] of plan.elements.entries()) {
    if (seen.has(element.id)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Duplicate element id: ${element.id}`,
        path: ["elements", index, "id"],
      });
    }
    seen.add(element.id);
  }
});

export type SemanticElementPlan = z.infer<typeof semanticElementPlanSchema>;

const elementPlanningModelOutputObjectSchema = z.object({
  elementPlan: semanticElementPlanSchema,
}).strict();

export const elementPlanningModelOutputSchema = z.preprocess((value) => {
  const record = normalizeObject(value);
  if (!record) return value;
  const rawPlan = normalizeObject(record.elementPlan) ?? record;
  return { elementPlan: normalizeElementPlan(rawPlan) };
}, elementPlanningModelOutputObjectSchema);

export type ElementPlanningModelOutput = z.infer<typeof elementPlanningModelOutputSchema>;
export type ElementPlan = SemanticElementPlan;

export type ElementPlanningOutput = {
  document: DesignDocument;
  elementPlan: ElementPlan;
};

function normalizeElementPlan(plan: Record<string, unknown>) {
  return {
    elements: Array.isArray(plan.elements) ? plan.elements.map(normalizeElement) : [],
    notes: Array.isArray(plan.notes) ? plan.notes.map(String) : ["Normalized model element output."],
  };
}

function normalizeElement(value: unknown) {
  const element = normalizeObject(value) ?? {};
  return {
    ...element,
    id: typeof element.id === "string" && element.id.trim() ? element.id : "model_element",
    parentId: typeof element.parentId === "string" && element.parentId.trim() ? element.parentId : "",
    order: typeof element.order === "number" && Number.isInteger(element.order) && element.order >= 0 ? element.order : 0,
    type: normalizeEnum(element.type, ["text", "image", "button", "input", "filter", "form", "badge", "divider", "stat", "table"] as const, "text"),
    name: typeof element.name === "string" && element.name.trim() ? element.name : "Generated Element",
    purpose: typeof element.purpose === "string" && element.purpose.trim() ? element.purpose : "Generated content element",
    content: typeof element.content === "string" ? element.content : undefined,
    attributes: Array.isArray(element.attributes) ? element.attributes.map(normalizeAttribute) : [],
  };
}

function normalizeAttribute(value: unknown) {
  const attribute = normalizeObject(value) ?? {};
  return {
    key: typeof attribute.key === "string" && attribute.key.trim() ? attribute.key : "value",
    value: normalizeAttributeValue(attribute.value),
  };
}

function normalizeAttributeValue(value: unknown) {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map(String).slice(0, 10);
  return String(value ?? "");
}

function normalizeObject(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function normalizeEnum<T extends readonly string[]>(value: unknown, allowed: T, fallback: T[number]): T[number] {
  return typeof value === "string" && allowed.includes(value) ? value as T[number] : fallback;
}
