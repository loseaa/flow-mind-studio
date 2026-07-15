import type { DesignDocument } from "@flowmind/shared";
import { z } from "zod";

export const stylePresetSchema = z.enum([
  "page",
  "section",
  "panel",
  "heading",
  "subheading",
  "body",
  "muted",
  "media",
  "primary_action",
  "secondary_action",
  "control",
  "status",
  "metric",
  "data_table",
]);

export const stylePlanSchema = z.object({
  theme: z.enum(["neutral_workspace", "enterprise_light", "commerce_editorial", "data_dense"]),
  tone: z.enum(["quiet", "expressive", "premium", "operational"]),
  assignments: z.array(z.object({
    elementId: z.string().min(1),
    preset: stylePresetSchema,
  }).strict()).max(80),
  notes: z.array(z.string().min(1).max(500)).max(10),
}).strict().superRefine((plan, context) => {
  const elementIds = new Set<string>();
  for (const [index, assignment] of plan.assignments.entries()) {
    if (elementIds.has(assignment.elementId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Duplicate style assignment: ${assignment.elementId}`,
        path: ["assignments", index, "elementId"],
      });
    }
    elementIds.add(assignment.elementId);
  }
});

const stylePlanningModelOutputObjectSchema = z.object({
  stylePlan: stylePlanSchema,
}).strict();

export const stylePlanningModelOutputSchema = z.preprocess((value) => {
  const record = normalizeObject(value);
  if (!record) return value;
  const rawPlan = normalizeObject(record.stylePlan) ?? record;
  const assignments = Array.isArray(rawPlan.assignments)
    ? rawPlan.assignments
    : Array.isArray(rawPlan.styles)
      ? rawPlan.styles
      : [];
  return {
    stylePlan: {
      theme: normalizeTheme(rawPlan.theme),
      tone: normalizeTone(rawPlan.tone),
      assignments: assignments.map(normalizeAssignment),
      notes: Array.isArray(rawPlan.notes) ? rawPlan.notes.map(String) : [],
    },
  };
}, stylePlanningModelOutputObjectSchema);

export type StylePlanningModelOutput = z.infer<typeof stylePlanningModelOutputSchema>;
export type StylePlan = z.infer<typeof stylePlanSchema>;
export type StylePreset = z.infer<typeof stylePresetSchema>;

export type StylePlanningOutput = {
  document: DesignDocument;
  stylePlan: StylePlan;
};

function normalizeAssignment(value: unknown) {
  const assignment = normalizeObject(value) ?? {};
  return {
    elementId: normalizeText(assignment.elementId ?? assignment.id, "model_style_element"),
    preset: normalizePreset(assignment.preset ?? assignment.style ?? assignment.role),
  };
}

function normalizeTheme(value: unknown): StylePlan["theme"] {
  const direct = normalizeEnum(value, ["neutral_workspace", "enterprise_light", "commerce_editorial", "data_dense"] as const);
  if (direct) return direct;
  const hint = typeof value === "string" ? value.toLowerCase() : "";
  if (/commerce|shop|product|editorial/.test(hint)) return "commerce_editorial";
  if (/data|dashboard|dense/.test(hint)) return "data_dense";
  if (/enterprise|business|professional|light/.test(hint)) return "enterprise_light";
  return "neutral_workspace";
}

function normalizeTone(value: unknown): StylePlan["tone"] {
  const direct = normalizeEnum(value, ["quiet", "expressive", "premium", "operational"] as const);
  if (direct) return direct;
  const hint = typeof value === "string" ? value.toLowerCase() : "";
  if (/premium|luxury/.test(hint)) return "premium";
  if (/expressive|bold|vibrant/.test(hint)) return "expressive";
  if (/operational|utility|dense/.test(hint)) return "operational";
  return "quiet";
}

function normalizePreset(value: unknown): StylePreset {
  const allowed = [
    "page", "section", "panel", "heading", "subheading", "body", "muted", "media",
    "primary_action", "secondary_action", "control", "status", "metric", "data_table",
  ] as const;
  const direct = normalizeEnum(value, allowed);
  if (direct) return direct;
  const hint = typeof value === "string" ? value.toLowerCase().replace(/[-\s]+/g, "_") : "";
  if (/title|heading|hero/.test(hint)) return "heading";
  if (/subtitle|subheading/.test(hint)) return "subheading";
  if (/primary.*button|cta|primary_action/.test(hint)) return "primary_action";
  if (/button|secondary_action/.test(hint)) return "secondary_action";
  if (/image|media|visual/.test(hint)) return "media";
  if (/input|form|control/.test(hint)) return "control";
  if (/badge|status/.test(hint)) return "status";
  if (/stat|metric/.test(hint)) return "metric";
  if (/table|grid/.test(hint)) return "data_table";
  if (/muted|caption/.test(hint)) return "muted";
  if (/text|body|paragraph/.test(hint)) return "body";
  if (/section/.test(hint)) return "section";
  if (/page/.test(hint)) return "page";
  return "panel";
}

function normalizeText(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function normalizeObject(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function normalizeEnum<T extends readonly string[]>(value: unknown, allowed: T): T[number] | undefined {
  return typeof value === "string" && allowed.includes(value) ? value as T[number] : undefined;
}
