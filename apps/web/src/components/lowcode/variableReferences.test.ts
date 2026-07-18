import { describe, expect, it } from "vitest";
import type { DesignDocument } from "@flowmind/shared";
import { fallbackDesignDocument } from "./lowcodeData";
import { diagnoseVariableReferences, findVariableReferences } from "./variableReferences";
import { renameVariablePath } from "./variableOperations";

function documentWithTemplate(): DesignDocument {
  const document = structuredClone(fallbackDesignDocument);
  document.variables = { customer: { name: "Acme" } };
  const title = document.elements.find((element) => element.id === "title_text");
  if (title) title.props = { ...title.props, text: "Customer: {{ customer.name }}" };
  return document;
}

describe("variable references", () => {
  it("finds references with element and property context", () => {
    expect(findVariableReferences(documentWithTemplate(), "customer.name")).toEqual([
      expect.objectContaining({ elementId: "title_text", propertyPath: "props.text", variablePath: "customer.name" })
    ]);
  });

  it("renames a variable and every reference atomically", () => {
    const result = renameVariablePath(documentWithTemplate(), "customer.name", "customer.companyName");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.updatedReferences).toBe(1);
    expect(result.document.variables).toEqual({ customer: { companyName: "Acme" } });
    expect(result.document.elements.find((element) => element.id === "title_text")?.props.text).toBe("Customer: {{ customer.companyName }}");
  });

  it("leaves the document untouched when the target path exists", () => {
    const document = documentWithTemplate();
    document.variables.customer = { name: "Acme", companyName: "Existing" };
    const result = renameVariablePath(document, "customer.name", "customer.companyName");
    expect(result.ok).toBe(false);
    expect(document.variables).toEqual({ customer: { name: "Acme", companyName: "Existing" } });
  });

  it("diagnoses missing and non-renderable references", () => {
    const document = documentWithTemplate();
    const title = document.elements.find((element) => element.id === "title_text");
    if (title) title.props = { ...title.props, text: "{{missing}} {{customer}}" };
    expect(diagnoseVariableReferences(document).map((item) => item.code)).toEqual(["VARIABLE_NOT_FOUND", "VARIABLE_NOT_RENDERABLE"]);
  });

  it("diagnoses malformed placeholders", () => {
    const document = documentWithTemplate();
    const title = document.elements.find((element) => element.id === "title_text");
    if (title) title.props = { ...title.props, text: "{{customer-name}}" };
    expect(diagnoseVariableReferences(document)).toEqual([
      expect.objectContaining({ code: "INVALID_VARIABLE_SYNTAX", message: "无效变量语法：{{customer-name}}" })
    ]);
  });

  it("tracks, renames, and validates structured bindings", () => {
    const document = documentWithTemplate();
    const title = document.elements.find((element) => element.id === "title_text");
    if (title) {
      title.props = { ...title.props, text: "Fallback" };
      title.bindings = { text: { kind: "variable", path: "customer.name" } };
    }

    expect(findVariableReferences(document, "customer.name")).toEqual([
      expect.objectContaining({ kind: "variable-binding", propertyPath: "bindings.text" })
    ]);
    const result = renameVariablePath(document, "customer.name", "customer.companyName");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.elements.find((element) => element.id === "title_text")?.bindings?.text).toEqual({ kind: "variable", path: "customer.companyName" });
    expect(diagnoseVariableReferences(result.document)).toEqual([]);
  });

  it("accepts array values bound to table rows", () => {
    const document = structuredClone(fallbackDesignDocument);
    document.variables = { query: { customers: { data: [{ id: 1, name: "Ada" }] } } };
    const table = document.elements.find((element) => element.type === "table");
    if (table) table.bindings = { rows: { kind: "variable", path: "query.customers.data" } };

    expect(diagnoseVariableReferences(document)).toEqual([]);
  });

});
