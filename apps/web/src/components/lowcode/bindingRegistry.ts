import type { DesignElement } from "@flowmind/shared";
import type { BindingExpectedType } from "./bindingResolver";

export type BindingMode = "literal" | "variable" | "template";

export type BindingPropertyDefinition = {
  expectedType: BindingExpectedType;
  modes: BindingMode[];
};

const registry: Partial<Record<DesignElement["type"], Record<string, BindingPropertyDefinition>>> = {
  text: { text: { expectedType: "string", modes: ["literal", "variable", "template"] } },
  button: {
    label: { expectedType: "string", modes: ["literal", "variable", "template"] },
    disabled: { expectedType: "boolean", modes: ["literal", "variable"] }
  },
  image: {
    alt: { expectedType: "string", modes: ["literal", "variable", "template"] },
    src: { expectedType: "url", modes: ["literal", "variable"] }
  },
  table: { rows: { expectedType: "array", modes: ["literal", "variable"] } }
};

export function bindingPropertyDefinition(type: DesignElement["type"], property: string) {
  return registry[type]?.[property];
}
