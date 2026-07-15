import { designImageSlotSchema, designLayoutSchema, type DesignDocument } from "@flowmind/shared";
import { z } from "zod";

const layoutStrategySchema = z.enum([
  "hero_split",
  "editorial_sections",
  "product_showcase",
  "dashboard_grid",
]);

export const layoutPlanSchema = z.object({
  strategy: layoutStrategySchema,
  rootId: z.string().min(1),
  sectionIds: z.array(z.string().min(1)).max(40),
  rhythm: z.enum(["compact", "standard", "immersive"]),
  hierarchy: z.object({
    titleElementId: z.string().min(1),
    primaryVisualSlotId: z.string().min(1),
    primaryActionElementId: z.string().min(1),
  }).partial().strict(),
  containerLayouts: z.array(z.object({
    elementId: z.string().min(1),
    layout: designLayoutSchema,
  }).strict()).max(60).optional(),
  imageSlots: z.array(designImageSlotSchema).max(10),
  notes: z.array(z.string().min(1).max(500)).max(10),
}).strict();

const layoutPlanningModelOutputObjectSchema = z.object({
  layoutPlan: layoutPlanSchema,
}).strict();

export const layoutPlanningModelOutputSchema = z.preprocess((value) => {
  const record = normalizeObject(value);
  if (!record) return value;
  const rawPlan = normalizeObject(record.layoutPlan) ?? record;
  return { layoutPlan: normalizeLayoutPlan(rawPlan) };
}, layoutPlanningModelOutputObjectSchema);

export type LayoutPlanningModelOutput = z.infer<typeof layoutPlanningModelOutputSchema>;
export type LayoutPlan = z.infer<typeof layoutPlanSchema>;

export type LayoutPlanningOutput = {
  document: DesignDocument;
  layoutPlan: LayoutPlan;
};

function normalizeLayoutPlan(plan: Record<string, unknown>) {
  return {
    strategy: typeof plan.strategy === "string" ? plan.strategy : "product_showcase",
    rootId: plan.rootId,
    sectionIds: Array.isArray(plan.sectionIds) ? plan.sectionIds : [],
    rhythm: typeof plan.rhythm === "string" ? plan.rhythm : "standard",
    hierarchy: normalizeHierarchy(plan.hierarchy),
    ...(Array.isArray(plan.containerLayouts)
      ? { containerLayouts: plan.containerLayouts.map(normalizeContainerLayout) }
      : {}),
    imageSlots: Array.isArray(plan.imageSlots) ? plan.imageSlots.map(normalizeImageSlot) : [],
    notes: Array.isArray(plan.notes) ? plan.notes.map(String) : ["Normalized model layout output."],
  };
}

function normalizeContainerLayout(value: unknown) {
  const assignment = normalizeObject(value) ?? {};
  return {
    elementId: typeof assignment.elementId === "string" ? assignment.elementId : "",
    layout: normalizeObject(assignment.layout) ?? {},
  };
}

function normalizeHierarchy(value: unknown) {
  const hierarchy = normalizeObject(value);
  if (!hierarchy) return {};
  return {
    ...(typeof hierarchy.titleElementId === "string" ? { titleElementId: hierarchy.titleElementId } : {}),
    ...(typeof hierarchy.primaryVisualSlotId === "string" ? { primaryVisualSlotId: hierarchy.primaryVisualSlotId } : {}),
    ...(typeof hierarchy.primaryActionElementId === "string" ? { primaryActionElementId: hierarchy.primaryActionElementId } : {}),
  };
}

function normalizeImageSlot(value: unknown) {
  const slot = normalizeObject(value) ?? {};
  const display = normalizeObject(slot.display) ?? {};
  const generation = normalizeObject(slot.generation) ?? {};
  const role = normalizeEnum(slot.role ?? slot.slotType, ["hero", "section", "card", "gallery"] as const, "section");
  return {
    id: typeof slot.id === "string" ? slot.id : "layout_model_slot",
    parentId: typeof slot.parentId === "string" ? slot.parentId : "",
    role,
    placement: normalizeEnum(slot.placement, ["background", "inline"] as const, role === "hero" ? "background" : "inline"),
    display: {
      aspectRatio: normalizeAspectRatio(display.aspectRatio),
      width: normalizeEnum(display.width, ["fill", "half", "third"] as const, role === "card" ? "third" : "fill"),
      maxHeight: normalizeHeight(display.maxHeight, role),
      objectFit: normalizeEnum(display.objectFit, ["cover", "contain"] as const, "cover"),
      focalPoint: normalizeEnum(display.focalPoint, ["center", "top", "left", "right"] as const, "center"),
    },
    generation: {
      width: normalizeNumber(generation.width, role === "hero" ? 1536 : 1200),
      height: normalizeNumber(generation.height, role === "hero" ? 864 : 900),
      safeArea: normalizeEnum(generation.safeArea, ["left", "right", "center", "none"] as const, role === "hero" ? "left" : "none"),
    },
  };
}

function normalizeAspectRatio(value: unknown) {
  if (typeof value !== "string") return "4:3";
  return normalizeEnum(value.replace("/", ":"), ["16:9", "4:3", "3:2", "1:1", "3:4"] as const, "4:3");
}

function normalizeHeight(value: unknown, role: unknown) {
  const parsed = typeof value === "string" ? Number(value.replace(/px$/i, "")) : value;
  const fallback = role === "hero" ? 480 : role === "card" ? 240 : 360;
  return normalizeNumber(parsed, fallback);
}

function normalizeNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : fallback;
}

function normalizeObject(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function normalizeEnum<T extends readonly string[]>(value: unknown, allowed: T, fallback: T[number]): T[number] {
  return typeof value === "string" && allowed.includes(value) ? value as T[number] : fallback;
}
