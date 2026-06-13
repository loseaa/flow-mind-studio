import { render, screen } from "@testing-library/react";
import { CompletionContext } from "@codemirror/autocomplete";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { describe, expect, it } from "vitest";
import type { DesignVariables } from "@flowmind/shared";
import { buildVariableCompletionOptions, createVariableCompletionSource, shouldStartVariableCompletion, VariableTextEditor } from "./VariableTextEditor";

const variables: DesignVariables = {
  customerName: "Acme",
  customer: { name: "Ada", empty: "" },
  order: { items: [{ title: "Starter" }], total: 128, paid: true },
  metadata: { tags: ["vip"] }
};

describe("VariableTextEditor", () => {
  it("renders a CodeMirror editor for variable-aware text editing", () => {
    render(<VariableTextEditor ariaLabel="Content" value="Hello" variables={variables} onChange={() => undefined} />);

    expect(screen.getByLabelText("Content")).toBeInTheDocument();
    expect(document.querySelector(".cm-editor")).not.toBeNull();
  });

  it("builds variable completion options that insert full placeholders", () => {
    const options = buildVariableCompletionOptions(variables);

    expect(options).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "customerName"
        }),
        expect.objectContaining({
          label: "customer.name"
        }),
        expect.objectContaining({
          label: "order.items.0.title"
        })
      ])
    );
    expect(options.some((option) => option.label === "customer")).toBe(false);
    expect(options.some((option) => option.label === "metadata.tags")).toBe(false);
    expect(options.some((option) => option.label === "customer.empty")).toBe(false);
  });

  it("requests automatic completion only after two opening braces", () => {
    expect(shouldStartVariableCompletion("{{", 2)).toBe(true);
    expect(shouldStartVariableCompletion("Hello {{", 8)).toBe(true);
    expect(shouldStartVariableCompletion("{", 1)).toBe(false);
    expect(shouldStartVariableCompletion("Hello {", 7)).toBe(false);
    expect(shouldStartVariableCompletion("{{customer", 10)).toBe(false);
  });

  it("offers every accessible variable after double braces and applies the selected placeholder", () => {
    const source = createVariableCompletionSource(variables);
    const state = EditorState.create({ doc: "{{" });
    const result = source(new CompletionContext(state, 2, true));

    expect(result?.from).toBe(2);
    expect(result?.options).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "customerName" }),
        expect.objectContaining({ label: "customer.name" }),
        expect.objectContaining({ label: "order.items.0.title" }),
        expect.objectContaining({ label: "order.total" }),
        expect.objectContaining({ label: "order.paid" }),
        expect.objectContaining({ label: "metadata.tags.0" })
      ])
    );

    const option = result?.options.find((item) => item.label === "customer.name");
    const parent = document.createElement("div");
    document.body.appendChild(parent);
    const view = new EditorView({ parent, state });

    if (typeof option?.apply !== "function") throw new Error("Expected variable completion to use a custom apply function");
    option.apply(view, option, result?.from ?? 0, 2);

    expect(view.state.doc.toString()).toBe("{{customer.name}}");

    view.destroy();
    parent.remove();
  });
});
