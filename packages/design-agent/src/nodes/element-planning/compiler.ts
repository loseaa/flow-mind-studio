import {
  designDocumentSchema,
  type DesignBaseStyle,
  type DesignDocument,
  type DesignElement,
  type DesignTreeNode,
  type JsonValue,
} from "@flowmind/shared";

import { semanticElementPlanSchema, type SemanticElementPlan } from "./schema.js";

type SemanticElement = SemanticElementPlan["elements"][number];

export function compileSemanticElementPlan(
  document: DesignDocument,
  input: SemanticElementPlan,
): DesignDocument {
  const plan = semanticElementPlanSchema.parse(input);
  const existing = new Map(document.elements.map((element) => [element.id, element]));
  const elementsByParent = new Map<string, SemanticElement[]>();

  for (const element of plan.elements) {
    if (existing.has(element.id)) throw new Error(`Element id already exists: ${element.id}`);
    const parent = existing.get(element.parentId);
    if (!parent) throw new Error(`Missing parent container: ${element.parentId}`);
    if (parent.type !== "page" && parent.type !== "section" && parent.type !== "stack") {
      throw new Error(`Parent is not a container: ${element.parentId}`);
    }
    const siblings = elementsByParent.get(element.parentId) ?? [];
    siblings.push(element);
    elementsByParent.set(element.parentId, siblings);
  }
  for (const siblings of elementsByParent.values()) {
    siblings.sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
  }

  const appendElements = (node: DesignTreeNode): DesignTreeNode => ({
    id: node.id,
    children: [
      ...(node.children ?? []).map(appendElements),
      ...(elementsByParent.get(node.id) ?? []).map((element) => ({ id: element.id, children: [] })),
    ],
  });

  return designDocumentSchema.parse({
    ...document,
    tree: appendElements(document.tree),
    elements: [
      ...document.elements,
      ...plan.elements.map(createDesignElement),
    ],
  });
}

function createDesignElement(element: SemanticElement): DesignElement {
  const attributes = Object.fromEntries(element.attributes.map(({ key, value }) => [key, value])) as Record<string, JsonValue>;
  const common = {
    id: element.id,
    name: element.name,
    props: createProps(element, attributes),
  };

  switch (element.type) {
    case "text":
    case "link":
      return {
        ...common,
        type: element.type,
        layout: { width: "fill" },
        style: {
          base: baseStyle("transparent"),
          text: {
            role: readTextRole(attributes.role),
            decoration: "none",
            transform: "none",
          },
        },
      };
    case "image":
      return {
        ...common,
        type: "image",
        layout: { width: "fill", height: "hug" },
        style: {
          base: baseStyle("muted"),
          image: {
            aspectRatio: readAspectRatio(attributes.aspectRatio),
            objectFit: "cover",
          },
        },
      };
    case "avatar":
      return {
        ...common,
        type: "avatar",
        layout: { width: "hug", height: "hug" },
        style: {
          base: baseStyle("muted"),
          avatar: { size: "md", shape: "circle", fallback: "initials" },
        },
      };
    case "button":
      return {
        ...common,
        type: "button",
        layout: { width: "hug" },
        style: {
          base: baseStyle("brand", "white"),
          button: { size: "md", emphasis: "primary" },
        },
      };
    case "input":
    case "textarea":
    case "select":
    case "checkbox":
    case "radio":
    case "switch":
    case "filter":
    case "form":
      return {
        ...common,
        type: element.type,
        layout: { width: "fill" },
        style: {
          base: baseStyle("white"),
          control: { size: "md", labelPosition: "top", fieldGap: "sm" },
        },
      };
    case "badge":
      return {
        ...common,
        type: "badge",
        layout: { width: "hug" },
        style: {
          base: baseStyle("muted"),
          badge: { size: "sm", shape: "pill", emphasis: "soft" },
        },
      };
    case "divider":
      return {
        ...common,
        type: "divider",
        layout: { width: "fill" },
        style: {
          base: baseStyle("transparent"),
          divider: { direction: "horizontal", thickness: "sm", labelPosition: "start" },
        },
      };
    case "shape":
      return {
        ...common,
        type: "shape",
        layout: { width: "fixed", fixedWidth: 48, height: "fixed", fixedHeight: 48 },
        style: {
          base: baseStyle("brand"),
          shape: { kind: "rectangle", direction: "horizontal", thickness: "md" },
        },
      };
    case "progress":
      return {
        ...common,
        type: "progress",
        layout: { width: "fill" },
        style: {
          base: baseStyle("muted"),
          progress: { size: "md", labelPosition: "top", showValue: true },
        },
      };
    case "stat":
      return {
        ...common,
        type: "stat",
        layout: { width: "fixed", fixedWidth: 240, grow: "fill" },
        style: {
          base: baseStyle("white"),
          stat: { valueSize: "lg", trendPosition: "below" },
        },
      };
    case "table":
      return {
        ...common,
        type: "table",
        layout: { width: "fill" },
        style: {
          base: baseStyle("white"),
          table: { density: "default", zebra: true, headerBackground: "muted", borderMode: "rows" },
        },
      };
  }
}

function createProps(element: SemanticElement, attributes: Record<string, JsonValue>) {
  const content = element.content?.trim() || element.name;
  const common = { ...attributes, purpose: element.purpose };
  if (element.type === "text") return { ...common, text: content };
  if (element.type === "link") return { ...common, label: content, href: String(attributes.href ?? "#"), target: "_self" };
  if (element.type === "image") return { ...common, alt: content };
  if (element.type === "avatar") return { ...common, name: content, alt: content, src: String(attributes.src ?? "") };
  if (element.type === "button") return { ...common, label: content };
  if (["input", "textarea", "select", "checkbox", "radio", "switch", "filter", "form"].includes(element.type)) {
    return { ...common, label: element.name, placeholder: content };
  }
  if (element.type === "badge") return { ...common, text: content };
  if (element.type === "divider") return { ...common, label: content };
  if (element.type === "stat") return { ...common, label: element.name, value: content };
  if (element.type === "progress") return { ...common, label: element.name, value: typeof attributes.value === "number" ? attributes.value : 50, max: 100 };
  return common;
}

function baseStyle(
  backgroundColor: DesignBaseStyle["backgroundColor"],
  color: DesignBaseStyle["text"]["color"] = "textPrimary",
): DesignBaseStyle {
  return {
    backgroundColor,
    radius: "md",
    border: { width: "none", style: "none", color: "border" },
    text: {
      color,
      fontFamily: "sans",
      fontSize: "md",
      fontWeight: "regular",
      lineHeight: "normal",
      align: "left",
    },
  };
}

function readTextRole(value: JsonValue | undefined) {
  return value === "heading" || value === "subheading" || value === "caption" ? value : "body";
}

function readAspectRatio(value: JsonValue | undefined) {
  return value === "square" || value === "portrait" ? value : "wide";
}
