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
    viewport: z.literal("desktop"),
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

export const jsonPlanningModelOutputSchema = z.object({
  structurePlan: pageStructurePlanSchema,
}).strict();

export type JsonPlanningModelOutput = z.infer<typeof jsonPlanningModelOutputSchema>;

export type JsonPlanningOutput = {
  structurePlan: PageStructurePlan;
  document: DesignDocument;
};