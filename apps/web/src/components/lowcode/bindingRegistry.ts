import type { DesignElement } from "@flowmind/shared";
import type { BindingExpectedType } from "./bindingResolver";

export type BindingMode = "literal" | "variable" | "template";

export type BindingPropertyDefinition = {
  expectedType: BindingExpectedType;
  modes: BindingMode[];
};

const registry: Partial<Record<DesignElement["type"], Record<string, BindingPropertyDefinition>>> = {
  text: { text: { expectedType: "string", modes: ["literal", "variable", "template"] } },
  link: {
    label: { expectedType: "string", modes: ["literal", "variable", "template"] },
    href: { expectedType: "string", modes: ["literal", "variable", "template"] }
  },
  button: {
    label: { expectedType: "string", modes: ["literal", "variable", "template"] },
    disabled: { expectedType: "boolean", modes: ["literal", "variable"] }
  },
  image: {
    alt: { expectedType: "string", modes: ["literal", "variable", "template"] },
    src: { expectedType: "url", modes: ["literal", "variable"] }
  },
  avatar: {
    name: { expectedType: "string", modes: ["literal", "variable", "template"] },
    src: { expectedType: "url", modes: ["literal", "variable"] }
  },
  textarea: {
    label: { expectedType: "string", modes: ["literal", "variable", "template"] },
    value: { expectedType: "string", modes: ["literal", "variable"] }
  },
  select: {
    value: { expectedType: "string", modes: ["literal", "variable"] },
    options: { expectedType: "array", modes: ["literal", "variable"] }
  },
  checkbox: { checked: { expectedType: "boolean", modes: ["literal", "variable"] } },
  radio: { value: { expectedType: "string", modes: ["literal", "variable"] } },
  switch: { checked: { expectedType: "boolean", modes: ["literal", "variable"] } },
  progress: { value: { expectedType: "number", modes: ["literal", "variable"] } },
  stat: { value: { expectedType: "number", modes: ["literal", "variable"] } },
  table: { rows: { expectedType: "array", modes: ["literal", "variable"] } }
};

export function bindingPropertyDefinition(type: DesignElement["type"], property: string) {
  return registry[type]?.[property];
}
