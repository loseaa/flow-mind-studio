export type MaterialDropPosition = "inside" | "before" | "after";
export type MaterialDropAxis = "vertical" | "horizontal";

export type MaterialDropPlacement = {
  parentId: string;
  index?: number;
  position: MaterialDropPosition;
  axis: MaterialDropAxis;
};

export type MaterialDropTarget = {
  element: HTMLElement;
  placement: MaterialDropPlacement;
};

export function resolveMaterialDropTarget({
  clientX,
  clientY,
  preview,
  ignoredNodeIds = [],
  root = document
}: {
  clientX: number;
  clientY: number;
  ignoredNodeIds?: string[];
  preview?: HTMLElement | null;
  root?: Document;
}): MaterialDropTarget | null {
  const ignoredIds = new Set(ignoredNodeIds);
  const hoveredNode = deepestElementAtPoint(root, ".design-sortable-node", clientX, clientY, ignoredIds);
  if (hoveredNode) {
    const containerId = hoveredNode.getAttribute("data-drop-parent-id");
    if (containerId) {
      const nestedChild = directChildAtPoint(root, containerId, clientX, clientY, ignoredIds);
      const containerPlacement = containerSelfTarget(root, hoveredNode, containerId, clientX, clientY, ignoredIds);
      if (containerPlacement) return containerPlacement;
      if (!nestedChild) return insideTarget(hoveredNode, containerId);
      return siblingTarget(root, nestedChild, clientX, clientY, ignoredIds);
    }
    return siblingTarget(root, hoveredNode, clientX, clientY, ignoredIds);
  }

  const dropzone = resolveDropzone(root, preview ?? null, clientX, clientY, ignoredIds);
  const parentId = dropzone?.getAttribute("data-drop-parent-id");
  if (!dropzone || !parentId) return null;
  return insideTarget(dropzone, parentId);
}

function insideTarget(element: HTMLElement, parentId: string): MaterialDropTarget {
  return {
    element,
    placement: {
      parentId,
      position: "inside",
      axis: readAxis(element)
    }
  };
}

function containerSelfTarget(root: Document, node: HTMLElement, containerId: string, clientX: number, clientY: number, ignoredIds: Set<string>): MaterialDropTarget | null {
  const parentId = node.getAttribute("data-parent-id");
  if (!parentId) return insideTarget(node, containerId);
  const parentDropzone = findDropzoneByParentId(root, parentId);
  const axis = readAxis(parentDropzone ?? node);
  const rect = node.getBoundingClientRect();
  const before = axis === "horizontal" ? clientX <= rect.left + rect.width * 0.25 : clientY <= rect.top + rect.height * 0.25;
  const after = axis === "horizontal" ? clientX >= rect.right - rect.width * 0.25 : clientY >= rect.bottom - rect.height * 0.25;
  if (!before && !after) return null;
  return siblingTarget(root, node, before ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY, before ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY, ignoredIds);
}

function siblingTarget(root: Document, node: HTMLElement, clientX: number, clientY: number, ignoredIds: Set<string>): MaterialDropTarget | null {
  const parentId = node.getAttribute("data-parent-id");
  if (!parentId) return null;
  const parentDropzone = findDropzoneByParentId(root, parentId);
  const axis = readAxis(parentDropzone ?? node);
  const siblings = Array.from(root.querySelectorAll<HTMLElement>(".design-sortable-node")).filter((element) => !isIgnoredElement(element, ignoredIds) && element.getAttribute("data-parent-id") === parentId);
  const nodeIndex = siblings.indexOf(node);
  if (nodeIndex < 0) return null;

  const rect = node.getBoundingClientRect();
  const after = axis === "horizontal" ? clientX >= rect.left + rect.width / 2 : clientY >= rect.top + rect.height / 2;
  return {
    element: node,
    placement: {
      parentId,
      index: nodeIndex + (after ? 1 : 0),
      position: after ? "after" : "before",
      axis
    }
  };
}

function directChildAtPoint(root: Document, parentId: string, clientX: number, clientY: number, ignoredIds: Set<string>) {
  return Array.from(root.querySelectorAll<HTMLElement>(".design-sortable-node"))
    .filter((element) => !isIgnoredElement(element, ignoredIds) && element.getAttribute("data-parent-id") === parentId && containsPoint(element.getBoundingClientRect(), clientX, clientY))
    .sort((left, right) => elementDepth(right, ".design-sortable-node") - elementDepth(left, ".design-sortable-node"))[0] ?? null;
}

function deepestElementAtPoint(root: Document, selector: string, clientX: number, clientY: number, ignoredIds: Set<string>) {
  return Array.from(root.querySelectorAll<HTMLElement>(selector))
    .filter((element) => !isIgnoredElement(element, ignoredIds) && containsPoint(element.getBoundingClientRect(), clientX, clientY))
    .sort((left, right) => {
      const depthDelta = elementDepth(right, selector) - elementDepth(left, selector);
      if (depthDelta !== 0) return depthDelta;
      return elementArea(left) - elementArea(right);
    })[0] ?? null;
}

function resolveDropzone(root: Document, preview: HTMLElement | null, clientX: number, clientY: number, ignoredIds: Set<string>) {
  const previewRect = preview?.getBoundingClientRect();
  const previewArea = previewRect ? Math.max(1, previewRect.width * previewRect.height) : 1;
  return Array.from(root.querySelectorAll<HTMLElement>(".design-node-dropzone"))
    .map((element) => {
      if (isIgnoredElement(element, ignoredIds)) return null;
      const rect = element.getBoundingClientRect();
      const area = rect.width * rect.height;
      if (area <= 0) return null;
      const pointerInside = containsPoint(rect, clientX, clientY);
      const intersection = previewRect ? intersectionArea(previewRect, rect) : 0;
      if (!pointerInside && intersection <= 0) return null;
      const depth = elementDepth(element, ".design-node-dropzone");
      const pointerScore = pointerInside ? 100000 + depth * 1000 + 10000 / area : 0;
      const overlapScore = previewRect ? (intersection / Math.min(previewArea, area)) * 100 + depth : 0;
      return { element, score: pointerScore + overlapScore };
    })
    .filter((item): item is { element: HTMLElement; score: number } => item !== null)
    .sort((left, right) => right.score - left.score)[0]?.element ?? null;
}

function isIgnoredElement(element: HTMLElement, ignoredIds: Set<string>) {
  if (ignoredIds.size === 0) return false;
  if (ignoredIds.has(element.getAttribute("data-node-id") ?? "")) return true;
  if (ignoredIds.has(element.getAttribute("data-drop-parent-id") ?? "")) return true;
  let current = element.parentElement?.closest(".design-sortable-node") as HTMLElement | null;
  while (current) {
    if (ignoredIds.has(current.getAttribute("data-node-id") ?? "")) return true;
    current = current.parentElement?.closest(".design-sortable-node") as HTMLElement | null;
  }
  return false;
}

function findDropzoneByParentId(root: Document, parentId: string) {
  return Array.from(root.querySelectorAll<HTMLElement>(".design-node-dropzone")).find((element) => element.getAttribute("data-drop-parent-id") === parentId) ?? null;
}

function readAxis(element: HTMLElement | null): MaterialDropAxis {
  return element?.getAttribute("data-layout-direction") === "horizontal" ? "horizontal" : "vertical";
}

function containsPoint(rect: DOMRect, clientX: number, clientY: number) {
  return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
}

function elementArea(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  return rect.width * rect.height;
}

function elementDepth(element: HTMLElement, selector: string) {
  let depth = 0;
  let current = element.parentElement?.closest(selector) as HTMLElement | null;
  while (current) {
    depth += 1;
    current = current.parentElement?.closest(selector) as HTMLElement | null;
  }
  return depth;
}

function intersectionArea(left: DOMRect, right: DOMRect) {
  const width = Math.max(0, Math.min(left.right, right.right) - Math.max(left.left, right.left));
  const height = Math.max(0, Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top));
  return width * height;
}
