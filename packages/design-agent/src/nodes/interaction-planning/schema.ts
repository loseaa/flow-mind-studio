import type { DesignDocument } from "@flowmind/shared";
import { z } from "zod";

const interactionValueSchema = z.union([
  z.string().max(500),
  z.number(),
  z.boolean(),
  z.array(z.string().max(200)).max(10),
]);

export const interactionPlanSchema = z.object({
  interactions: z.array(z.object({
    id: z.string().min(1),
    sourceElementId: z.string().min(1),
    event: z.enum(["click", "change", "submit", "select", "toggle"]),
    action: z.enum(["navigate", "filter", "toggle", "open", "update", "submit", "refresh", "zoom", "select"]),
    targetElementId: z.string().min(1).optional(),
    description: z.string().min(1).max(500),
    payload: z.array(z.object({
      key: z.string().min(1).max(100),
      value: interactionValueSchema,
    }).strict()).max(10),
  }).strict()).max(50),
  notes: z.array(z.string().min(1).max(500)).max(10),
}).strict().superRefine((plan, context) => {
  const ids = new Set<string>();
  for (const [index, interaction] of plan.interactions.entries()) {
    if (ids.has(interaction.id)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Duplicate interaction id: ${interaction.id}`,
        path: ["interactions", index, "id"],
      });
    }
    ids.add(interaction.id);
  }
});

export type InteractionPlan = z.infer<typeof interactionPlanSchema>;

const interactionPlanningModelOutputObjectSchema = z.object({
  interactionPlan: interactionPlanSchema,
}).strict();

export const interactionPlanningModelOutputSchema = z.preprocess((value) => {
  const record = normalizeObject(value);
  if (!record) return value;
  const rawPlan = normalizeObject(record.interactionPlan) ?? record;
  const rawInteractions = Array.isArray(rawPlan.interactions)
    ? rawPlan.interactions
    : typeof rawPlan.sourceElementId === "string"
      ? [rawPlan]
      : [];
  return {
    interactionPlan: {
      interactions: rawInteractions.map(normalizeInteraction),
      notes: Array.isArray(rawPlan.notes) ? rawPlan.notes.map(String) : [],
    },
  };
}, interactionPlanningModelOutputObjectSchema);

export type InteractionPlanningOutput = {
  document: DesignDocument;
  interactionPlan: InteractionPlan;
};

function normalizeInteraction(value: unknown, index: number) {
  const interaction = normalizeObject(value) ?? {};
  const event = normalizeEnum(
    interaction.event ?? interaction.trigger,
    ["click", "change", "submit", "select", "toggle"] as const,
    "click",
  ) ?? "click";
  const targetElementId = normalizeOptionalText(interaction.targetElementId);
  return {
    id: normalizeText(interaction.id, `model_interaction_${index + 1}`),
    sourceElementId: normalizeText(interaction.sourceElementId, "model_source_element"),
    event,
    action: normalizeAction(interaction.action, event),
    ...(targetElementId ? { targetElementId } : {}),
    description: normalizeText(interaction.description, "Generated interaction"),
    payload: Array.isArray(interaction.payload) ? interaction.payload.map(normalizePayloadEntry) : [],
  };
}

function normalizeAction(value: unknown, event: string) {
  const direct = normalizeEnum(
    value,
    ["navigate", "filter", "toggle", "open", "update", "submit", "refresh", "zoom", "select"] as const,
    undefined,
  );
  if (direct) return direct;
  const alias = typeof value === "string" ? value.toLowerCase().replace(/[^a-z]/g, "") : "";
  if (/starttrial|signup|register|send|confirm|save/.test(alias)) return "submit";
  if (/navigate|redirect|goto|link/.test(alias)) return "navigate";
  if (/modal|dialog|drawer|open/.test(alias)) return "open";
  if (/refresh|reload/.test(alias)) return "refresh";
  if (/filter|search/.test(alias)) return "filter";
  if (/toggle|switch/.test(alias)) return "toggle";
  if (/select|choose/.test(alias)) return "select";
  if (/zoom/.test(alias)) return "zoom";
  if (/update|change|edit/.test(alias)) return "update";
  if (event === "submit") return "submit";
  if (event === "change") return "update";
  if (event === "toggle") return "toggle";
  if (event === "select") return "select";
  return "open";
}

function normalizePayloadEntry(value: unknown) {
  const entry = normalizeObject(value) ?? {};
  return {
    key: normalizeText(entry.key, "value"),
    value: normalizeInteractionValue(entry.value),
  };
}

function normalizeInteractionValue(value: unknown): string | number | boolean | string[] {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map(String).slice(0, 10);
  return String(value ?? "");
}

function normalizeText(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function normalizeOptionalText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeObject(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function normalizeEnum<T extends readonly string[]>(
  value: unknown,
  allowed: T,
  fallback: T[number] | undefined,
): T[number] | undefined {
  return typeof value === "string" && allowed.includes(value) ? value as T[number] : fallback;
}
