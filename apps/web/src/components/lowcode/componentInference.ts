import type { DesignBinding, DesignElement, JsonValue } from "@flowmind/shared";
import { createElementFromMaterial } from "./lowcodeData";
import type { DesignElementTree } from "./designDocumentOps";

export type InferableData = {
  source: "pageVariable" | "queryResult";
  path: string;
  label: string;
  value: JsonValue;
  columns?: string[];
  queryId?: string;
  queryRevision?: number;
};

export type ComponentInferenceKind = "text" | "image" | "stat" | "detail" | "table" | "valueList";

export type ComponentInferenceResult = {
  kind: ComponentInferenceKind;
  reason: string;
  tree: DesignElementTree;
  selectId: string;
};

type RecordData = Omit<InferableData, "value"> & { value: Record<string, JsonValue> };
type ArrayData = Omit<InferableData, "value"> & { value: JsonValue[] };

export function inferComponentTree(input: InferableData): ComponentInferenceResult {
  if (Array.isArray(input.value)) return inferArray({ ...input, value: input.value });
  if (isRecord(input.value)) return inferRecord({ ...input, value: input.value });
  if (typeof input.value === "number") return scalarStat(input);
  if (typeof input.value === "string" && looksLikeImage(input.path, input.value)) return scalarImage(input);
  return scalarText(input);
}

function scalarStat(input: InferableData): ComponentInferenceResult {
  const element = createElementFromMaterial("stat");
  element.name = input.label;
  element.props = { ...element.props, label: input.label, value: input.value, delta: "" };
  element.bindings = { value: variableBinding(input.path, input.value) };
  return single("stat", "数值变量适合使用指标卡展示", element);
}

function scalarImage(input: InferableData): ComponentInferenceResult {
  const element = createElementFromMaterial("image");
  element.name = input.label;
  element.props = { ...element.props, alt: input.label, src: input.value };
  element.bindings = { src: variableBinding(input.path, input.value) };
  return single("image", "变量名称或内容符合图片地址特征", element);
}

function scalarText(input: InferableData): ComponentInferenceResult {
  const element = createElementFromMaterial("text");
  element.name = input.label;
  element.props = { ...element.props, text: displayScalar(input.value) };
  element.bindings = { text: textBinding(input.path, input.value) };
  return single("text", "标量变量适合使用文本组件展示", element);
}

function inferRecord(input: RecordData): ComponentInferenceResult {
  const fields = Object.entries(input.value).filter(([, value]) => isScalar(value)).slice(0, 8);
  if (fields.length === 1 && typeof fields[0][1] === "number") {
    return scalarStat({ ...input, path: `${input.path}.${fields[0][0]}`, label: humanize(fields[0][0]), value: fields[0][1] });
  }

  const root = createElementFromMaterial("stack");
  root.name = `${input.label}详情`;
  root.layout = { ...root.layout, display: "flex", direction: "vertical", gap: "sm", padding: "md", width: "fill" };
  const children = fields.map(([field, value]) => {
    const element = createElementFromMaterial(typeof value === "number" ? "stat" : "text");
    element.name = humanize(field);
    if (element.type === "stat") {
      element.props = { ...element.props, label: humanize(field), value, delta: "", compact: true };
      element.bindings = { value: variableBinding(`${input.path}.${field}`, value) };
    } else {
      element.props = { ...element.props, text: `${humanize(field)}：${displayScalar(value)}` };
      element.bindings = { text: labelTemplate(humanize(field), `${input.path}.${field}`) };
    }
    return element;
  });
  return {
    kind: "detail",
    reason: `对象包含 ${fields.length} 个可展示字段，生成详情组件组`,
    tree: { root: { id: root.id, children: children.map((element) => ({ id: element.id, children: [] })) }, elements: [root, ...children] },
    selectId: root.id
  };
}

function inferArray(input: ArrayData): ComponentInferenceResult {
  const firstRecord = input.value.find(isRecord);
  const columns = input.columns?.length ? input.columns : firstRecord ? Object.keys(firstRecord).filter((key) => isScalar(firstRecord[key])).slice(0, 10) : [];
  if (columns.length) {
    const element = createElementFromMaterial("table");
    element.name = input.label;
    element.props = { ...element.props, columns };
    element.bindings = { rows: variableBinding(input.path, input.value) };
    return single("table", `数组包含结构化记录，按 ${columns.length} 个字段生成表格`, element);
  }

  const values = input.value.filter(isScalar).slice(0, 6);
  const root = createElementFromMaterial("stack");
  root.name = `${input.label}列表`;
  root.layout = { ...root.layout, display: "flex", direction: "vertical", gap: "sm", padding: "md", width: "fill" };
  const children = values.map((value, index) => {
    const path = `${input.path}.${index}`;
    const element = createElementFromMaterial(typeof value === "number" ? "stat" : "text");
    element.name = `${input.label} ${index + 1}`;
    if (element.type === "stat") {
      element.props = { ...element.props, label: `${input.label} ${index + 1}`, value, delta: "", compact: true };
      element.bindings = { value: variableBinding(path, value) };
    } else {
      element.props = { ...element.props, text: displayScalar(value) };
      element.bindings = { text: textBinding(path, value) };
    }
    return element;
  });
  return {
    kind: "valueList",
    reason: `数组包含 ${values.length} 个标量值，生成纵向组件组`,
    tree: { root: { id: root.id, children: children.map((element) => ({ id: element.id, children: [] })) }, elements: [root, ...children] },
    selectId: root.id
  };
}

function single(kind: ComponentInferenceKind, reason: string, element: DesignElement): ComponentInferenceResult {
  return { kind, reason, tree: { root: { id: element.id, children: [] }, elements: [element] }, selectId: element.id };
}

function variableBinding(path: string, fallback: JsonValue): DesignBinding {
  return { kind: "variable", path, fallback };
}

function textBinding(path: string, value: JsonValue): DesignBinding {
  return typeof value === "string" ? variableBinding(path, value) : { kind: "template", segments: [{ kind: "variable", path }] };
}

function labelTemplate(label: string, path: string): DesignBinding {
  return { kind: "template", segments: [{ kind: "text", value: `${label}：` }, { kind: "variable", path }] };
}

function isRecord(value: JsonValue): value is Record<string, JsonValue> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isScalar(value: JsonValue): value is string | number | boolean | null {
  return value === null || typeof value !== "object";
}

function displayScalar(value: JsonValue) {
  if (value === null) return "";
  return String(value);
}

function looksLikeImage(path: string, value: string) {
  return /(?:image|avatar|photo|logo|cover|thumbnail|图片|头像)/i.test(path)
    || /^(?:data:image\/|https?:\/\/[^\s]+\.(?:png|jpe?g|webp|gif|svg)(?:\?[^\s]*)?$)/i.test(value);
}

export function humanize(value: string) {
  return value.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").replace(/^./, (character) => character.toUpperCase());
}
