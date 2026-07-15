import { useEffect, useMemo, useRef } from "react";
import type { DesignVariables, JsonValue } from "@flowmind/shared";
import { autocompletion, startCompletion, type Completion, type CompletionContext } from "@codemirror/autocomplete";
import { EditorState } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, type DecorationSet } from "@codemirror/view";
import { isUserVariableKey } from "./variableVisibility";

export function VariableTextEditor({
  ariaLabel,
  onChange,
  placeholder,
  value,
  variables
}: {
  ariaLabel: string;
  onChange: (value: string) => void;
  placeholder?: string;
  value: string;
  variables: DesignVariables;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const extensions = useMemo(
    () => [
      EditorView.contentAttributes.of({ "aria-label": ariaLabel }),
      EditorView.domEventHandlers({
        keydown(event) {
          return event.key === "Enter";
        }
      }),
      EditorState.transactionFilter.of((transaction) => (transaction.newDoc.lines > 1 ? [] : transaction)),
      EditorView.updateListener.of((update) => {
        if (!update.docChanged) return;
        const nextValue = update.state.doc.toString();
        onChangeRef.current(nextValue);
        const selection = update.state.selection.main;
        if (selection.empty && shouldStartVariableCompletion(nextValue, selection.head)) {
          startCompletion(update.view);
        }
      }),
      autocompletion({
        activateOnTyping: true,
        override: [createVariableCompletionSource(variables)]
      }),
      variablePlaceholderHighlighter,
      EditorView.theme({
        "&": {
          minHeight: "36px",
          border: "1px solid #d9e1e8",
          borderRadius: "6px",
          backgroundColor: "#fff",
          fontSize: "13px"
        },
        "&.cm-focused": {
          outline: "2px solid rgba(15, 118, 110, 0.18)",
          borderColor: "#9cc8c2"
        },
        ".cm-scroller": {
          overflow: "hidden",
          fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
        },
        ".cm-content": {
          minHeight: "34px",
          padding: "7px 10px",
          whiteSpace: "pre"
        },
        ".cm-placeholder": {
          color: "#8a94a3"
        },
        ".cm-lowcode-variable": {
          borderRadius: "4px",
          backgroundColor: "#e8f4f2",
          color: "#0f766e",
          fontWeight: "600",
          padding: "0 1px"
        },
        ".cm-tooltip-autocomplete": {
          border: "1px solid #d9e1e8",
          borderRadius: "8px",
          boxShadow: "0 14px 30px -20px rgba(15, 23, 42, 0.7)",
          overflow: "hidden"
        }
      }),
      placeholder ? EditorView.contentAttributes.of({ "data-placeholder": placeholder }) : []
    ],
    [ariaLabel, placeholder, variables]
  );

  useEffect(() => {
    if (!hostRef.current) return;
    const view = new EditorView({
      parent: hostRef.current,
      state: EditorState.create({ doc: value, extensions })
    });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [extensions]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || view.state.doc.toString() === value) return;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
  }, [value]);

  return (
    <>
      <input aria-hidden="true" className="sr-only" tabIndex={-1} value={value} onChange={(event) => onChange(event.target.value)} />
      <div ref={hostRef} className="mt-1" data-variable-text-editor />
    </>
  );
}

export function buildVariableCompletionOptions(variables: DesignVariables): Completion[] {
  return [
    ...buildVariablePaths(variables).map((path) => ({
      label: path,
      type: "variable",
      detail: "Variable path",
      apply: applyVariableCompletion(path)
    })),
    {
      label: "{{variable}}",
      type: "keyword",
      detail: "Variable placeholder",
      apply: "{{}}"
    }
  ];
}

export function shouldStartVariableCompletion(documentText: string, position: number) {
  if (position < 2) return false;
  return documentText.slice(position - 2, position) === "{{";
}

export function createVariableCompletionSource(variables: DesignVariables) {
  return (context: CompletionContext) => {
    const before = context.state.sliceDoc(0, context.pos);
    const placeholderMatch = /(\{\{\s*)([a-zA-Z0-9_.]*)$/.exec(before);
    const word = context.matchBefore(/[a-zA-Z_][a-zA-Z0-9_.]*/);
    if (!placeholderMatch && !context.explicit) return null;

    return {
      from: placeholderMatch ? context.pos - placeholderMatch[2].length : word?.from ?? context.pos,
      options: buildVariableCompletionOptions(variables)
    };
  };
}

function applyVariableCompletion(path: string) {
  return (view: EditorView, _completion: Completion, from: number, to: number) => {
    const beforeCompletion = view.state.sliceDoc(0, from);
    const placeholderPrefix = /\{\{\s*$/.exec(beforeCompletion);
    const replacementFrom = placeholderPrefix ? from - placeholderPrefix[0].length : from;
    const insert = `{{${path}}}`;
    view.dispatch({
      changes: { from: replacementFrom, to, insert },
      selection: { anchor: replacementFrom + insert.length }
    });
  };
}

function buildVariablePaths(value: JsonValue, prefix = ""): string[] {
  if (isRenderableVariableValue(value)) return prefix ? [prefix] : [];
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => buildVariablePaths(item, prefix ? `${prefix}.${index}` : String(index)));
  }
  if (value && typeof value === "object") {
    return Object.entries(value).filter(([key]) => Boolean(prefix) || isUserVariableKey(key)).flatMap(([key, nested]) => {
      const path = prefix ? `${prefix}.${key}` : key;
      return buildVariablePaths(nested, path);
    });
  }
  return [];
}

function isRenderableVariableValue(value: JsonValue): value is string | number | boolean {
  if (value === "") return false;
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

const variablePlaceholderHighlighter = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildVariableDecorations(view);
    }

    update(update: { docChanged: boolean; viewportChanged: boolean; view: EditorView }) {
      if (update.docChanged || update.viewportChanged) this.decorations = buildVariableDecorations(update.view);
    }
  },
  { decorations: (plugin) => plugin.decorations }
);

function buildVariableDecorations(view: EditorView) {
  const decorations = [];
  const mark = Decoration.mark({ class: "cm-lowcode-variable" });
  const pattern = /\{\{\s*[a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z0-9_]+)*\s*\}\}/g;
  for (const range of view.visibleRanges) {
    const text = view.state.sliceDoc(range.from, range.to);
    for (const match of text.matchAll(pattern)) {
      const from = range.from + (match.index ?? 0);
      decorations.push(mark.range(from, from + match[0].length));
    }
  }
  return Decoration.set(decorations, true);
}
