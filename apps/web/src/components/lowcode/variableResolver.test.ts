import { describe, expect, it } from "vitest";
import type { DesignVariables } from "@flowmind/shared";
import { resolveVariableText } from "./variableResolver";

const variables: DesignVariables = {
  customerName: "Acme",
  ownerName: "Ada",
  emptyValue: "",
  customer: { name: "Deep Acme" },
  order: { items: [{ title: "Starter" }], total: 128, paid: true },
  metadata: { tags: ["vip"] },
  nothing: null
};

describe("resolveVariableText", () => {
  it("resolves a top-level string variable placeholder", () => {
    expect(resolveVariableText("Customer: {{customerName}}", variables)).toBe("Customer: Acme");
  });

  it("resolves a deep object path placeholder", () => {
    expect(resolveVariableText("Customer: {{customer.name}}", variables)).toBe("Customer: Deep Acme");
  });

  it("resolves an array index path placeholder", () => {
    expect(resolveVariableText("Item: {{order.items.0.title}}", variables)).toBe("Item: Starter");
  });

  it("renders number and boolean values as text", () => {
    expect(resolveVariableText("Total: {{order.total}}, paid: {{order.paid}}", variables)).toBe("Total: 128, paid: true");
  });

  it("keeps a missing variable placeholder unchanged", () => {
    expect(resolveVariableText("Customer: {{ missing }}", variables)).toBe("Customer: {{ missing }}");
  });

  it("keeps an empty variable placeholder unchanged", () => {
    expect(resolveVariableText("Value: {{emptyValue}}", variables)).toBe("Value: {{emptyValue}}");
  });

  it("keeps object, array, and null placeholders unchanged", () => {
    expect(resolveVariableText("Object: {{customer}}", variables)).toBe("Object: {{customer}}");
    expect(resolveVariableText("Array: {{metadata.tags}}", variables)).toBe("Array: {{metadata.tags}}");
    expect(resolveVariableText("Null: {{nothing}}", variables)).toBe("Null: {{nothing}}");
  });

  it("resolves multiple variables in the same string", () => {
    expect(resolveVariableText("{{customerName}} owned by {{ ownerName }}", variables)).toBe("Acme owned by Ada");
  });
});
