import { describe, expect, it } from "vitest";
import { deleteVariablePath, parseVariablePath, readVariablePath, setVariablePath } from "./variablePath";

describe("variablePath", () => {
  it("parses normalized safe dot paths", () => {
    expect(parseVariablePath(" customer . items . 0 . name ")).toEqual({ ok: true, value: ["customer", "items", "0", "name"] });
  });

  it.each(["__proto__.polluted", "customer.constructor.name", "customer.prototype.value"])("rejects unsafe path %s", (path) => {
    const result = parseVariablePath(path);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("UNSAFE_SEGMENT");
  });

  it("rejects empty path segments", () => {
    const result = parseVariablePath("customer..name");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("EMPTY_SEGMENT");
  });

  it("creates and reads nested arrays safely", () => {
    const result = setVariablePath({}, "order.items.0.title", "Starter");
    expect(result).toEqual({ ok: true, value: { order: { items: [{ title: "Starter" }] } } });
    if (result.ok) expect(readVariablePath(result.value, "order.items.0.title")).toEqual({ ok: true, value: "Starter" });
  });

  it("reports scalar path conflicts without modifying input", () => {
    const variables = { customer: "Acme" };
    const result = setVariablePath(variables, "customer.name", "Beta");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("PATH_CONFLICT");
    expect(variables).toEqual({ customer: "Acme" });
  });

  it("splices array entries on deletion", () => {
    expect(deleteVariablePath({ items: ["A", "B", "C"] }, "items.1")).toEqual({ ok: true, value: { items: ["A", "C"] } });
  });

  it("rejects writes that would create sparse arrays", () => {
    const result = setVariablePath({ items: [] }, "items.2", "C");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INVALID_ARRAY_INDEX");
  });
});
