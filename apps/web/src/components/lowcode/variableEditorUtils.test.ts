import { describe, expect, it } from "vitest";
import { deleteByPath, flattenVariablesToRows, parseVariableInputValue, setByPath } from "./variableEditorUtils";

describe("variableEditorUtils", () => {
  it("sets nested object values by dot path", () => {
    expect(setByPath({}, "customer.name", "Acme")).toEqual({ customer: { name: "Acme" } });
  });

  it("sets nested array values when path contains numeric segments", () => {
    expect(setByPath({}, "order.items.0.title", "Starter")).toEqual({ order: { items: [{ title: "Starter" }] } });
  });

  it("deletes a leaf path without removing sibling values", () => {
    expect(deleteByPath({ customer: { name: "Acme", level: "VIP" } }, "customer.name")).toEqual({ customer: { level: "VIP" } });
  });

  it("removes array items without leaving sparse holes", () => {
    expect(deleteByPath({ items: ["A", "B", "C"] }, "items.1")).toEqual({ items: ["A", "C"] });
  });

  it("does not overwrite a scalar when a nested path conflicts", () => {
    expect(setByPath({ customer: "Acme" }, "customer.name", "Beta")).toEqual({ customer: "Acme" });
  });

  it("rejects unsafe prototype paths", () => {
    expect(setByPath({}, "__proto__.polluted", "yes")).toEqual({});
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("parses value input into JSON-compatible values", () => {
    expect(parseVariableInputValue("plain text")).toBe("plain text");
    expect(parseVariableInputValue("123")).toBe(123);
    expect(parseVariableInputValue("12.5")).toBe(12.5);
    expect(parseVariableInputValue("true")).toBe(true);
    expect(parseVariableInputValue("false")).toBe(false);
    expect(parseVariableInputValue("null")).toBeNull();
    expect(parseVariableInputValue('{"tier":"VIP"}')).toEqual({ tier: "VIP" });
    expect(parseVariableInputValue('["a","b"]')).toEqual(["a", "b"]);
    expect(parseVariableInputValue("")).toBe("");
  });

  it("flattens editable leaf values into path rows", () => {
    expect(
      flattenVariablesToRows({
        customer: { name: "Acme", tier: "VIP" },
        order: { items: [{ title: "Starter" }] },
        empty: "",
        missing: null
      })
    ).toEqual([
      { path: "customer.name", value: "Acme" },
      { path: "customer.tier", value: "VIP" },
      { path: "order.items.0.title", value: "Starter" },
      { path: "empty", value: "" },
      { path: "missing", value: "null" }
    ]);
  });
});
