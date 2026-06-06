import type { DesignAppearance, DesignDocument, DesignElement, DesignLayout, DesignTreeNode } from "@flowmind/shared";
import { getTreeIds, isContainerElement } from "./lowcodeData";

export function elementMap(document: DesignDocument) {
  return new Map(document.elements.map((element) => [element.id, element]));
}

export function updateElement(document: DesignDocument, id: string, patch: Partial<DesignElement>): DesignDocument {
  return {
    ...document,
    elements: document.elements.map((element) => element.id === id ? { ...element, ...patch } : element)
  };
}

export function updateElementProps(document: DesignDocument, id: string, props: Record<string, unknown>): DesignDocument {
  return {
    ...document,
    elements: document.elements.map((element) => element.id === id ? { ...element, props: { ...element.props, ...props } } : element)
  };
}

export function updateElementLayout(document: DesignDocument, id: string, layout: Partial<DesignLayout>): DesignDocument {
  return {
    ...document,
    elements: document.elements.map((element) => element.id === id ? { ...element, layout: { ...element.layout, ...layout } } : element)
  };
}

export function updateElementAppearance(document: DesignDocument, id: string, appearance: Partial<DesignAppearance>): DesignDocument {
  return {
    ...document,
    elements: document.elements.map((element) => element.id === id ? { ...element, appearance: { ...element.appearance, ...appearance } } : element)
  };
}

export function insertElement(document: DesignDocument, parentId: string, element: DesignElement, index?: number): DesignDocument {
  const parent = document.elements.find((item) => item.id === parentId);
  const normalizedParentId = parent && isContainerElement(parent.type) ? parentId : document.tree.id;
  return {
    ...document,
    tree: insertTreeNode(document.tree, normalizedParentId, { id: element.id, children: [] }, index),
    elements: [...document.elements, element]
  };
}

export function removeNode(document: DesignDocument, id: string): DesignDocument {
  if (id === document.tree.id) return document;
  const removedIds = new Set<string>();
  const tree = removeFromTree(document.tree, id, removedIds);
  return {
    ...document,
    tree,
    elements: document.elements.filter((element) => !removedIds.has(element.id))
  };
}

export function moveNode(document: DesignDocument, id: string, direction: "up" | "down"): DesignDocument {
  return {
    ...document,
    tree: moveInTree(document.tree, id, direction)
  };
}

export function reparentNode(document: DesignDocument, id: string, parentId: string, index?: number): DesignDocument {
  if (id === document.tree.id || id === parentId) return document;
  const subtree = findTreeNode(document.tree, id);
  if (!subtree || getTreeIds(subtree).includes(parentId)) return document;
  const parent = document.elements.find((element) => element.id === parentId);
  const normalizedParentId = parent && isContainerElement(parent.type) ? parentId : document.tree.id;
  if (index == null && findParentId(document.tree, id) === normalizedParentId) return document;
  const removedIds = new Set<string>();
  const withoutNode = removeFromTree(document.tree, id, removedIds);
  return {
    ...document,
    tree: insertTreeNode(withoutNode, normalizedParentId, subtree, index)
  };
}

function insertTreeNode(node: DesignTreeNode, parentId: string, child: DesignTreeNode, index?: number): DesignTreeNode {
  if (node.id === parentId) {
    const children = [...(node.children ?? [])];
    const targetIndex = index == null ? children.length : Math.max(0, Math.min(index, children.length));
    children.splice(targetIndex, 0, child);
    return { ...node, children };
  }
  return {
    ...node,
    children: (node.children ?? []).map((current) => insertTreeNode(current, parentId, child, index))
  };
}

function removeFromTree(node: DesignTreeNode, id: string, removedIds: Set<string>): DesignTreeNode {
  const children: DesignTreeNode[] = [];
  for (const child of node.children ?? []) {
    if (child.id === id) {
      getTreeIds(child).forEach((removedId) => removedIds.add(removedId));
    } else {
      children.push(removeFromTree(child, id, removedIds));
    }
  }
  return { ...node, children };
}

function moveInTree(node: DesignTreeNode, id: string, direction: "up" | "down"): DesignTreeNode {
  const children = [...(node.children ?? [])];
  const index = children.findIndex((child) => child.id === id);
  if (index >= 0) {
    const nextIndex = direction === "up" ? index - 1 : index + 1;
    if (nextIndex >= 0 && nextIndex < children.length) {
      const [item] = children.splice(index, 1);
      children.splice(nextIndex, 0, item);
    }
    return { ...node, children };
  }
  return {
    ...node,
    children: children.map((child) => moveInTree(child, id, direction))
  };
}

function findTreeNode(node: DesignTreeNode, id: string): DesignTreeNode | null {
  if (node.id === id) return node;
  for (const child of node.children ?? []) {
    const found = findTreeNode(child, id);
    if (found) return found;
  }
  return null;
}

function findParentId(node: DesignTreeNode, id: string, parentId?: string): string | undefined {
  if (node.id === id) return parentId;
  for (const child of node.children ?? []) {
    const found = findParentId(child, id, node.id);
    if (found) return found;
  }
  return undefined;
}
