import { describe, expect, it } from "vitest";
import { inferComponentTree } from "./componentInference";

describe("component inference", () => {
  it("infers a stat with a structured numeric binding", () => {
    const result = inferComponentTree({ source: "pageVariable", path: "stats.total", label: "Total", value: 42 });
    expect(result.kind).toBe("stat");
    expect(result.tree.elements[0]).toMatchObject({ type: "stat", bindings: { value: { kind: "variable", path: "stats.total" } } });
  });

  it("infers a table from query records", () => {
    const rows = [{ id: 1, name: "Ada", active: true }, { id: 2, name: "Lin", active: false }];
    const result = inferComponentTree({ source: "queryResult", queryId: "query-1", path: "query.customers.data", label: "Customers", value: rows });
    expect(result.kind).toBe("table");
    expect(result.tree.elements[0]).toMatchObject({
      type: "table",
      props: { columns: ["id", "name", "active"] },
      bindings: { rows: { kind: "variable", path: "query.customers.data" } }
    });
  });

  it("infers a detail component tree from an object", () => {
    const result = inferComponentTree({ source: "pageVariable", path: "customer", label: "Customer", value: { name: "Ada", score: 96 } });
    expect(result.kind).toBe("detail");
    expect(result.tree.root.children).toHaveLength(2);
    expect(result.tree.elements.map((element) => element.type)).toEqual(["stack", "text", "stat"]);
  });

  it("uses persisted query columns for an empty result", () => {
    const result = inferComponentTree({ source: "queryResult", path: "query.orders.data", label: "Orders", value: [], columns: ["id", "amount"] });
    expect(result.kind).toBe("table");
    expect(result.tree.elements[0]).toMatchObject({ props: { columns: ["id", "amount"] } });
  });
});
