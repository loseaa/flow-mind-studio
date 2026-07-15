import { describe, expect, it } from "vitest";
import type { DesignBinding, DesignVariables } from "@flowmind/shared";
import { compileLegacyTemplate, resolveBinding, serializeBinding } from "./bindingResolver";

const variables: DesignVariables = { customer: { name: "Acme" }, loading: true, total: 128 };

describe("bindingResolver", () => {
  it("compiles legacy placeholders into structured bindings", () => {
    expect(compileLegacyTemplate("{{customer.name}}")).toEqual({ kind: "variable", path: "customer.name" });
    expect(compileLegacyTemplate("Customer: {{customer.name}}")).toEqual({
      kind: "template",
      segments: [{ kind: "text", value: "Customer: " }, { kind: "variable", path: "customer.name" }]
    });
  });

  it("resolves variable and template bindings", () => {
    expect(resolveBinding({ kind: "variable", path: "loading" }, variables, "boolean")).toEqual({ ok: true, value: true, dependencies: ["loading"] });
    expect(resolveBinding(compileLegacyTemplate("Customer: {{customer.name}}"), variables, "string")).toEqual({ ok: true, value: "Customer: Acme", dependencies: ["customer.name"] });
  });

  it("reports missing variables and incompatible types", () => {
    expect(resolveBinding({ kind: "variable", path: "missing" }, variables, "string")).toEqual(expect.objectContaining({ ok: false, error: "变量 missing 不存在" }));
    expect(resolveBinding({ kind: "variable", path: "total" }, variables, "boolean")).toEqual(expect.objectContaining({ ok: false, error: "绑定值类型与 boolean 不兼容" }));
  });

  it("round trips serialized template bindings", () => {
    const binding: DesignBinding = { kind: "template", segments: [{ kind: "text", value: "Hi " }, { kind: "variable", path: "customer.name" }] };
    expect(serializeBinding(binding)).toBe("Hi {{customer.name}}");
  });
});
