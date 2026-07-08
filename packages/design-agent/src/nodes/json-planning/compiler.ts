import {
  designDocumentSchema,
  type DesignDocument,
  type DesignElement,
  type DesignTreeNode,
} from "@flowmind/shared";

import { pageStructurePlanSchema, type PageStructurePlan } from "./schema.js";

type StructureNode = PageStructurePlan["nodes"][number];

export function compilePageStructurePlan(input: PageStructurePlan): DesignDocument {
  const plan = pageStructurePlanSchema.parse(input);
  const root = plan.nodes.find((node) => node.parentId === null);
  if (!root) throw new Error("Page structure root is missing.");

  const childrenByParent = new Map<string, StructureNode[]>();
  for (const node of plan.nodes) {
    if (node.parentId === null) continue;
    const siblings = childrenByParent.get(node.parentId) ?? [];
    siblings.push(node);
    childrenByParent.set(node.parentId, siblings);
  }
  for (const siblings of childrenByParent.values()) siblings.sort(compareNodes);

  const orderedNodes: StructureNode[] = [];
  const buildTree = (node: StructureNode): DesignTreeNode => {
    orderedNodes.push(node);
    return {
      id: node.id,
      children: (childrenByParent.get(node.id) ?? []).map(buildTree),
    };
  };
  const tree = buildTree(root);

  return designDocumentSchema.parse({
    schemaVersion: "fm-design/v1",
    id: plan.document.id,
    name: plan.document.name,
    canvas: {
      viewport: plan.document.viewport,
      width: plan.document.width,
      background: plan.document.background,
    },
    tree,
    elements: orderedNodes.map((node) => createContainerElement(node, root.id, plan.document.background)),
    variables: {
      structurePurposes: Object.fromEntries(plan.nodes.map((node) => [node.id, node.purpose])),
    },
  });
}

function compareNodes(left: StructureNode, right: StructureNode) {
  return left.order - right.order || left.id.localeCompare(right.id);
}

function createContainerElement(
  node: StructureNode,
  rootId: string,
  rootBackground: PageStructurePlan["document"]["background"],
): DesignElement {
  const isRoot = node.id === rootId;
  return {
    id: node.id,
    name: node.name,
    type: node.type,
    layout: {
      display: "flex",
      direction: "vertical",
      gap: isRoot ? "lg" : "md",
      padding: isRoot ? "lg" : "md",
      width: "fill",
    },
    props: { purpose: node.purpose },
    style: {
      base: {
        backgroundColor: isRoot ? rootBackground : node.type === "stack" ? "muted" : "white",
        radius: isRoot ? "none" : "md",
        border: { width: "none", style: "none", color: "border" },
        text: {
          color: "textPrimary",
          fontFamily: "sans",
          fontSize: "md",
          fontWeight: "regular",
          lineHeight: "normal",
          align: "left",
        },
      },
      container: {
        shadow: "none",
        overflow: "visible",
        surface: isRoot ? "flat" : node.type === "stack" ? "panel" : "card",
      },
    },
  };
}