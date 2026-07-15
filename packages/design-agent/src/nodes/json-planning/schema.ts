import type { DesignDocument } from "@flowmind/shared";
import { z } from "zod";

export const pageStructureNodeSchema = z.object({
  id: z.string().min(1),
  parentId: z.string().min(1).nullable(),
  order: z.number().int().nonnegative(),
  type: z.enum(["page", "section", "stack"]),
  name: z.string().min(1),
  purpose: z.string().min(1),
}).strict();

export const pageStructurePlanSchema = z.object({
  document: z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    viewport: z.enum(["mobile", "tablet", "desktop"]),
    width: z.number().int().positive().max(3840),
    background: z.enum(["surface", "muted", "white"]),
  }).strict(),
  nodes: z.array(pageStructureNodeSchema).min(1).max(40),
}).strict().superRefine((plan, context) => {
  const nodesById = new Map<string, (typeof plan.nodes)[number]>();
  for (const [index, node] of plan.nodes.entries()) {
    if (nodesById.has(node.id)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Duplicate node id: ${node.id}`,
        path: ["nodes", index, "id"],
      });
    }
    nodesById.set(node.id, node);
  }

  const roots = plan.nodes.filter((node) => node.parentId === null);
  if (roots.length !== 1) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Page structure must contain exactly one root node.",
      path: ["nodes"],
    });
  } else if (roots[0]?.type !== "page") {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "The root node must use type page.",
      path: ["nodes"],
    });
  }

  for (const [index, node] of plan.nodes.entries()) {
    if (node.parentId !== null && !nodesById.has(node.parentId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Missing parent node: ${node.parentId}`,
        path: ["nodes", index, "parentId"],
      });
    }
  }

  for (const [index, node] of plan.nodes.entries()) {
    const visited = new Set<string>();
    let current: (typeof plan.nodes)[number] | undefined = node;
    while (current && current.parentId !== null) {
      if (visited.has(current.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Parent cycle detected at node: ${current.id}`,
          path: ["nodes", index, "parentId"],
        });
        break;
      }
      visited.add(current.id);
      current = nodesById.get(current.parentId);
    }
  }
});

export type PageStructurePlan = z.infer<typeof pageStructurePlanSchema>;

const jsonPlanningModelOutputObjectSchema = z.object({
  structurePlan: pageStructurePlanSchema,
}).strict();

export const jsonPlanningModelOutputSchema = z.preprocess((value) => {
  const record = normalizeObject(value);
  if (!record) return value;
  const rawPlan = normalizeObject(record.structurePlan) ?? record;
  return { structurePlan: normalizeStructurePlan(rawPlan) };
}, jsonPlanningModelOutputObjectSchema);

export type JsonPlanningModelOutput = z.infer<typeof jsonPlanningModelOutputSchema>;

export type JsonPlanningOutput = {
  structurePlan: PageStructurePlan;
  document: DesignDocument;
};

function normalizeStructurePlan(plan: Record<string, unknown>) {
  const nodes = Array.isArray(plan.nodes) ? plan.nodes.map(normalizeStructureNode) : [];
  const document = normalizeObject(plan.document) ?? {};
  const root = nodes.find((node) => node.parentId === null);
  const rootId = typeof root?.id === "string" ? root.id : "design_generated_page";
  const rootName = typeof root?.name === "string" ? root.name : "AI Generated Design";

  return {
    document: {
      id: normalizeText(document.id, rootId),
      name: normalizeText(document.name, rootName),
      viewport: normalizeViewport(document.viewport, document.width),
      width: normalizeWidth(document.width),
      background: normalizeEnum(document.background, ["surface", "muted", "white"] as const, "muted"),
    },
    nodes,
  };
}

function normalizeStructureNode(value: unknown) {
  const node = normalizeObject(value) ?? {};
  return {
    id: normalizeText(node.id, "model_structure_node"),
    parentId: node.parentId === null ? null : normalizeText(node.parentId, null),
    order: normalizeOrder(node.order),
    type: normalizeEnum(node.type, ["page", "section", "stack"] as const, node.parentId === null ? "page" : "section"),
    name: normalizeText(node.name, "Generated Region"),
    purpose: normalizeText(node.purpose, "Generated page region"),
  };
}

function normalizeText<T extends string | null>(value: unknown, fallback: T): string | T {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function normalizeOrder(value: unknown) {
  const parsed = typeof value === "string" ? Number(value) : value;
  return typeof parsed === "number" && Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function normalizeWidth(value: unknown) {
  const parsed = typeof value === "string" ? Number(value) : value;
  return typeof parsed === "number" && Number.isInteger(parsed) && parsed > 0 && parsed <= 3840 ? parsed : 1440;
}

function normalizeViewport(value: unknown, width: unknown) {
  if (value === "mobile" || value === "tablet" || value === "desktop") return value;
  const parsedWidth = typeof width === "string" ? Number(width) : width;
  if (typeof parsedWidth === "number" && parsedWidth <= 600) return "mobile";
  if (typeof parsedWidth === "number" && parsedWidth <= 1024) return "tablet";
  return "desktop";
}

function normalizeObject(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function normalizeEnum<T extends readonly string[]>(value: unknown, allowed: T, fallback: T[number]): T[number] {
  return typeof value === "string" && allowed.includes(value) ? value as T[number] : fallback;
}
