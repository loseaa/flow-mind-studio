import {
  AlignLeft,
  BadgeCheck,
  BarChart3,
  CheckSquare,
  Circle,
  CircleDot,
  FileText,
  Filter,
  Gauge,
  Image,
  Link,
  ListFilter,
  Minus,
  PanelRight,
  RectangleHorizontal,
  Save,
  Square,
  Table2,
  ToggleLeft,
  Type,
  UserCircle,
  type LucideIcon
} from "lucide-react";
import type { DesignBaseStyle, DesignDocument, DesignElement, DesignElementStyle, DesignElementType, DesignLayout, DesignTreeNode, LowCodeImageAsset } from "@flowmind/shared";

export type MaterialDefinition = {
  id: string;
  type: Exclude<DesignElementType, "page">;
  label: string;
  desc: string;
  icon: LucideIcon;
  shapeKind?: "rectangle" | "circle" | "line";
};

export const materialCategories: Array<{ title: string; items: MaterialDefinition[] }> = [
  {
    title: "布局",
    items: [
      { id: "stack", type: "stack", label: "Flex 容器", desc: "横向或纵向排列子元素", icon: FileText }
    ]
  },
  {
    title: "基础",
    items: [
      { id: "text", type: "text", label: "文本", desc: "标题、正文、辅助说明", icon: Type },
      { id: "link", type: "link", label: "链接", desc: "站内导航或外部链接", icon: Link },
      { id: "button", type: "button", label: "按钮", desc: "主按钮、次按钮、动作入口", icon: Save },
      { id: "image", type: "image", label: "图片", desc: "封面、产品图、头像区域", icon: Image },
      { id: "avatar", type: "avatar", label: "头像", desc: "用户头像、名称缩写占位", icon: UserCircle },
      { id: "badge", type: "badge", label: "徽标", desc: "状态、标签、轻量提示", icon: BadgeCheck },
      { id: "divider", type: "divider", label: "分割线", desc: "区块、行内或步骤分隔", icon: Minus },
      { id: "progress", type: "progress", label: "进度条", desc: "任务进度、完成比例", icon: Gauge }
    ]
  },
  {
    title: "形状",
    items: [
      { id: "shape-line", type: "shape", label: "直线", desc: "连接线、步骤线、视觉分隔", icon: Minus, shapeKind: "line" },
      { id: "shape-rectangle", type: "shape", label: "方块", desc: "色块、图标底板、容器占位", icon: Square, shapeKind: "rectangle" },
      { id: "shape-circle", type: "shape", label: "圆形", desc: "头像、状态点、步骤节点", icon: Circle, shapeKind: "circle" }
    ]
  },
  {
    title: "表单",
    items: [
      { id: "input", type: "input", label: "输入框", desc: "文本输入或搜索框", icon: RectangleHorizontal },
      { id: "textarea", type: "textarea", label: "文本域", desc: "多行文本和备注输入", icon: AlignLeft },
      { id: "select", type: "select", label: "选择器", desc: "单选下拉选项", icon: ListFilter },
      { id: "checkbox", type: "checkbox", label: "复选框", desc: "布尔选项和协议确认", icon: CheckSquare },
      { id: "radio", type: "radio", label: "单选组", desc: "互斥选项组", icon: CircleDot },
      { id: "switch", type: "switch", label: "开关", desc: "启用或关闭状态", icon: ToggleLeft },
      { id: "filter", type: "filter", label: "筛选区", desc: "搜索、选择器、日期范围", icon: Filter },
      { id: "form", type: "form", label: "表单区块", desc: "字段布局、校验、提交", icon: PanelRight }
    ]
  },
  {
    title: "数据展示",
    items: [
      { id: "stat", type: "stat", label: "指标卡", desc: "数值、趋势和状态", icon: BarChart3 },
      { id: "table", type: "table", label: "数据表格", desc: "列配置、分页、行操作", icon: Table2 }
    ]
  }
];

export const materials = materialCategories.flatMap((category) => category.items);

export type ComplexMaterialTemplate = {
  root: DesignTreeNode;
  elements: DesignElement[];
  selectId?: string;
};

export type ComplexMaterialDefinition = {
  id: string;
  label: string;
  desc: string;
  category: string;
  composition: string[];
  icon: LucideIcon;
  createTemplate: () => ComplexMaterialTemplate;
};

export type CustomComplexMaterialRecord = {
  id: string;
  label: string;
  desc: string;
  category: "自定义";
  composition: string[];
  template: ComplexMaterialTemplate;
};

export const CUSTOM_COMPLEX_MATERIALS_STORAGE_KEY = "flowmind.lowcode.customComplexMaterials";

export const complexMaterials: ComplexMaterialDefinition[] = [
  {
    id: "tabs",
    label: "Tab 栏",
    desc: "带 active 和数量徽标的导航标签组",
    category: "导航组件",
    composition: ["Flex", "文本", "徽标", "分割线"],
    icon: FileText,
    createTemplate: createTabsTemplate
  },
  {
    id: "customer-card",
    label: "客户展示卡片",
    desc: "客户摘要、状态、负责人和操作入口",
    category: "业务卡片",
    composition: ["Flex", "图片", "文本", "徽标", "指标卡", "按钮"],
    icon: BadgeCheck,
    createTemplate: createCustomerCardTemplate
  },
  {
    id: "metric-group",
    label: "指标总览卡片组",
    desc: "仪表盘顶部的多指标横向总览",
    category: "数据展示",
    composition: ["Flex", "指标卡"],
    icon: BarChart3,
    createTemplate: createMetricGroupTemplate
  },
  {
    id: "search-toolbar",
    label: "搜索筛选工具栏",
    desc: "搜索、筛选、状态标签和查询动作",
    category: "表单运营",
    composition: ["输入框", "筛选区", "徽标", "按钮"],
    icon: Filter,
    createTemplate: createSearchToolbarTemplate
  },
  {
    id: "table-section",
    label: "表格业务区块",
    desc: "标题、动作、筛选和数据表格组合",
    category: "数据展示",
    composition: ["Flex", "文本", "按钮", "筛选区", "数据表格"],
    icon: Table2,
    createTemplate: createTableSectionTemplate
  },
  {
    id: "approval-card",
    label: "审批进度卡片",
    desc: "步骤状态、负责人、时间和说明",
    category: "业务卡片",
    composition: ["Flex", "文本", "徽标", "分割线", "按钮"],
    icon: PanelRight,
    createTemplate: createApprovalCardTemplate
  }
];

export const complexMaterialCategories = Array.from(new Set(complexMaterials.map((item) => item.category))).map((title) => ({
  title,
  items: complexMaterials.filter((item) => item.category === title)
}));

export function complexMaterialCategoriesFor(items: ComplexMaterialDefinition[]) {
  return Array.from(new Set(items.map((item) => item.category))).map((title) => ({
    title,
    items: items.filter((item) => item.category === title)
  }));
}

export function customComplexMaterialRecordToDefinition(record: CustomComplexMaterialRecord): ComplexMaterialDefinition {
  return {
    id: record.id,
    label: record.label,
    desc: record.desc,
    category: record.category,
    composition: record.composition,
    icon: PanelRight,
    createTemplate: () => cloneComplexMaterialTemplate(record.template, record.id)
  };
}

export function readCustomComplexMaterialRecords(raw: string | null): CustomComplexMaterialRecord[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isCustomComplexMaterialRecord);
  } catch {
    return [];
  }
}

export function createCustomComplexMaterialRecord({
  desc,
  document,
  label
}: {
  desc: string;
  document: DesignDocument;
  label: string;
}): CustomComplexMaterialRecord | null {
  const trimmedLabel = label.trim();
  const childNodes = document.tree.children ?? [];
  if (!trimmedLabel || childNodes.length === 0) return null;
  const rootId = "custom_template_root";
  const contentId = "custom_template_content";
  const childIds = new Set(childNodes.flatMap(getTreeIds));
  const childElements = document.elements.filter((element) => childIds.has(element.id));
  if (childElements.length === 0) return null;
  return {
    id: `custom_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    label: trimmedLabel,
    desc: desc.trim() || "用户自定义复杂物料",
    category: "自定义",
    composition: compositionForElements(childElements),
    template: {
      root: treeNode(rootId, [treeNode(contentId, childNodes)]),
      selectId: rootId,
      elements: [
        complexContainerElement(rootId, `${trimmedLabel} 容器`, { width: "fill", height: "fill" }),
        stackElement(contentId, `Complex Material / ${trimmedLabel}`, { display: "flex", direction: "vertical", gap: "sm", padding: "none", width: "fill", height: "fill" }, { backgroundColor: "transparent", borderWidth: "none", shadow: "none" }),
        ...childElements
      ]
    }
  };
}
export const aiActions = ["AI 总结字段", "调用 CRM 查询", "生成审批流"];
export const DEFAULT_LOW_CODE_IMAGE_URL = "https://flowmindstudio.oss-cn-beijing.aliyuncs.com/low-code/backgrounds/default-customer-admin.png";

export const availableFields = ["name", "stage", "owner", "health", "lastContact", "amount"];
export const defaultBackgroundImageUrl = "https://flowmindstudio.oss-cn-beijing.aliyuncs.com/low-code/backgrounds/1780839643603-bf299984-flowmind-lowcode-background-test.png";

export const fieldLabels: Record<string, string> = {
  name: "客户名称",
  stage: "阶段",
  owner: "负责人",
  health: "健康度",
  lastContact: "最近联系",
  amount: "合同金额"
};

export const customerRows = [
  { name: "星云科技", stage: "线索", owner: "Ada", health: "健康", lastContact: "今天", amount: "¥128,000" },
  { name: "远航制造", stage: "方案中", owner: "Ben", health: "关注", lastContact: "昨天", amount: "¥86,400" },
  { name: "北辰零售", stage: "成交", owner: "Chen", health: "健康", lastContact: "3 天前", amount: "¥241,000" }
];

type DesignElementSeed = Omit<DesignElement, "style"> & {
  style?: DesignElementStyle;
};

export function createCustomMaterialBuilderDocument(): DesignDocument {
  return {
    schemaVersion: "fm-design/v1",
    id: `doc_custom_builder_${Math.random().toString(36).slice(2, 8)}`,
    name: "自定义复杂物料组装画布",
    canvas: { viewport: "desktop", width: 960, background: "surface" },
    variables: {},
    tree: { id: "custom_builder_root", children: [] },
    elements: [
      withDefaultStyle({
        id: "custom_builder_root",
        type: "page",
        name: "自定义复杂物料画布",
        layout: { display: "flex", direction: "vertical", gap: "sm", padding: "md", width: "fill", height: "fill" },
        props: {}
      } as DesignElementSeed)
    ]
  };
}

function baseStyle(overrides: Partial<Omit<DesignBaseStyle, "border" | "text">> & { border?: Partial<DesignBaseStyle["border"]>; text?: Partial<DesignBaseStyle["text"]> } = {}): DesignBaseStyle {
  const base: DesignBaseStyle = {
    backgroundColor: "transparent",
    radius: "md",
    border: { width: "none", style: "solid", color: "border" },
    text: { color: "textPrimary", fontFamily: "sans", fontSize: "md", fontWeight: "regular", lineHeight: "normal", align: "left" }
  };
  return {
    ...base,
    ...overrides,
    border: { ...base.border, ...overrides.border },
    text: { ...base.text, ...overrides.text }
  };
}

function defaultStyleForElement(element: Pick<DesignElementSeed, "type">): DesignElementStyle {
  if (element.type === "page" || element.type === "section" || element.type === "stack") {
    return {
      base: baseStyle({
        backgroundColor: element.type === "page" ? "white" : element.type === "stack" ? "muted" : "surface",
        radius: element.type === "page" ? "none" : "md",
        border: { width: element.type === "page" ? "none" : "sm", style: element.type === "stack" ? "dashed" : "solid" }
      }),
      container: { shadow: "none", overflow: "visible", surface: element.type === "page" ? "flat" : "card" }
    };
  }
  if (element.type === "text" || element.type === "link") {
    const role = "body";
    return {
      base: baseStyle({
        radius: "none",
        text: { fontSize: "md", fontWeight: "regular", lineHeight: "normal" }
      }),
      text: { role, decoration: "none", transform: "none" }
    };
  }
  if (element.type === "image") {
    return { base: baseStyle({ backgroundColor: "muted", radius: "lg", border: { width: "sm" } }), image: { aspectRatio: "wide", objectFit: "cover" } };
  }
  if (element.type === "avatar") {
    return { base: baseStyle({ backgroundColor: "muted", radius: "full", border: { width: "sm" }, text: { fontWeight: "semibold" } }), avatar: { size: "md", shape: "circle", fallback: "initials" } };
  }
  if (element.type === "button") {
    return {
      base: baseStyle({ backgroundColor: "brand", radius: "md", border: { width: "none" }, text: { color: "white", fontWeight: "semibold" } }),
      button: { size: "md", emphasis: "primary" }
    };
  }
  if (["input", "textarea", "select", "checkbox", "radio", "switch", "filter", "form"].includes(element.type)) {
    return { base: baseStyle({ backgroundColor: "white", radius: "md", border: { width: "sm" } }), control: { size: "md", labelPosition: "top", fieldGap: "sm" } };
  }
  if (element.type === "badge") {
    return { base: baseStyle({ backgroundColor: "success", radius: "md", border: { width: "sm" }, text: { color: "white", fontSize: "xs", fontWeight: "bold" } }), badge: { size: "md", shape: "square", emphasis: "soft" } };
  }
  if (element.type === "divider") {
    return { base: baseStyle({ backgroundColor: "transparent", radius: "none", border: { width: "sm" }, text: { color: "textSecondary", fontSize: "xs", fontWeight: "semibold" } }), divider: { direction: "horizontal", thickness: "sm", labelPosition: "center" } };
  }
  if (element.type === "shape") {
    return { base: baseStyle({ backgroundColor: "brand", radius: "sm", border: { width: "none" } }), shape: { kind: "rectangle", direction: "horizontal", thickness: "sm" } };
  }
  if (element.type === "stat") {
    return { base: baseStyle({ backgroundColor: "muted", radius: "lg", border: { width: "sm" } }), stat: { valueSize: "xl", trendPosition: "below" } };
  }
  if (element.type === "progress") {
    return { base: baseStyle({ backgroundColor: "muted", radius: "full", border: { width: "none" }, text: { fontSize: "sm", fontWeight: "medium" } }), progress: { size: "md", labelPosition: "top", showValue: true } };
  }
  return { base: baseStyle({ backgroundColor: "white", radius: "lg", border: { width: "sm" } }), table: { density: "default", zebra: false, headerBackground: "muted", borderMode: "rows" } };
}

function styleProps(element: DesignElementSeed): Record<string, unknown> {
  return { ...element.props };
}

function withDefaultStyle(element: DesignElementSeed): DesignElement {
  const { style, layout, ...rest } = element;
  return { ...rest, layout: defaultFillHeightLayout(layout), props: styleProps(element), style: style ?? defaultStyleForElement(element) } as DesignElement;
}

function defaultFillHeightLayout(layout: DesignLayout | undefined): DesignLayout {
  const { fixedHeight: _fixedHeight, ...rest } = layout ?? {};
  return { ...rest, height: "fill" };
}

export const fallbackDesignDocument: DesignDocument = {
  schemaVersion: "fm-design/v1",
  id: "doc_customer_admin",
  name: "客户管理设计稿",
  canvas: {
    viewport: "desktop",
    width: 1440,
    background: "surface"
  },
  variables: {
    customerName: "星云科技",
    ownerName: "Ada",
    monthlyRevenue: "¥455K",
    customer: {
      name: "星云科技"
    }
  },
  tree: {
    id: "page_root",
    children: [
      {
        id: "header_section",
        children: [
          { id: "title_text", children: [] },
          { id: "create_button", children: [] }
        ]
      },
      {
        id: "hero_image",
        children: []
      },
      {
        id: "metrics_row",
        children: [
          { id: "stat_leads", children: [] },
          { id: "stat_health", children: [] },
          { id: "stat_value", children: [] }
        ]
      },
      {
        id: "content_stack",
        children: [
          { id: "filter_bar", children: [] },
          { id: "customer_table", children: [] },
          { id: "customer_form", children: [] }
        ]
      }
    ]
  },
  elements: [
    {
      id: "page_root",
      type: "page",
      name: "客户管理页",
      layout: { display: "flex", direction: "vertical", gap: "lg", padding: "lg", width: "fill" },
      props: {}
    },
    {
      id: "header_section",
      type: "stack",
      name: "标题区",
      layout: { display: "flex", direction: "horizontal", gap: "md", align: "center", padding: "md" },
      style: {
        base: baseStyle({ backgroundColor: "muted", radius: "lg", border: { width: "sm" }, backgroundImage: defaultBackgroundImageUrl }),
        container: { shadow: "sm", overflow: "hidden", surface: "card" }
      },
      props: {}
    },
    {
      id: "title_text",
      type: "text",
      name: "页面标题",
      style: {
        base: baseStyle({ radius: "none", text: { fontSize: "2xl", fontWeight: "bold", lineHeight: "tight" } }),
        text: { role: "heading", decoration: "none", transform: "none" }
      },
      props: { text: "客户管理" }
    },
    {
      id: "create_button",
      type: "button",
      name: "新建客户按钮",
      props: { label: "新建客户", action: "openForm" }
    },
    {
      id: "hero_image",
      type: "image",
      name: "客户画像封面",
      props: { alt: "客户运营概览图", src: DEFAULT_LOW_CODE_IMAGE_URL }
    },
    {
      id: "metrics_row",
      type: "stack",
      name: "指标区",
      layout: { display: "flex", direction: "horizontal", gap: "md" },
      props: {}
    },
    {
      id: "stat_leads",
      type: "stat",
      name: "新增线索",
      props: { label: "新增线索", value: "128", delta: "+18%" }
    },
    {
      id: "stat_health",
      type: "stat",
      name: "健康客户",
      props: { label: "健康客户", value: "86%", delta: "+4.2%" }
    },
    {
      id: "stat_value",
      type: "stat",
      name: "预计合同额",
      props: { label: "预计合同额", value: "¥455K", delta: "本月" }
    },
    {
      id: "content_stack",
      type: "stack",
      name: "内容编排区",
      layout: { display: "flex", direction: "vertical", gap: "md" },
      props: {}
    },
    {
      id: "filter_bar",
      type: "filter",
      name: "筛选区",
      layout: { display: "flex", direction: "horizontal", gap: "sm" },
      props: { fields: ["stage", "owner", "health"] }
    },
    {
      id: "customer_table",
      type: "table",
      name: "客户列表",
      props: { columns: ["name", "stage", "owner", "health", "amount"] }
    },
    {
      id: "customer_form",
      type: "form",
      name: "客户表单",
      props: { fields: ["name", "stage", "owner", "amount"], mode: "drawer" }
    }
  ].map((element) => withDefaultStyle(element as DesignElementSeed))
};

export function createElementFromMaterial(materialId: MaterialDefinition["id"]): DesignElement {
  const legacy = createElementFromMaterialLegacy(materialId);
  return withDefaultStyle(legacy);
}

function createElementFromMaterialLegacy(materialId: MaterialDefinition["id"]): DesignElementSeed {
  const definition = materials.find((item) => item.id === materialId || item.type === materialId);
  const type = definition?.type ?? (materialId as MaterialDefinition["type"]);
  const id = `node_${type}_${Math.random().toString(36).slice(2, 8)}`;
  const name = definition?.label ?? type;
  const element: DesignElementSeed = {
    id,
    type,
    name,
    props: {}
  };

  if (type === "section") {
    return { ...element, layout: { display: "flex", direction: "vertical", gap: "md", padding: "md" } };
  }
  if (type === "stack") {
    return { ...element, layout: { display: "flex", direction: "vertical", gap: "md" } };
  }
  if (type === "text") {
    return { ...element, props: { text: "新的文本内容" } };
  }
  if (type === "link") {
    return { ...element, props: { label: "链接文本", href: "#", target: "_self" } };
  }
  if (type === "image") {
    return { ...element, props: { alt: "图片占位", src: DEFAULT_LOW_CODE_IMAGE_URL } };
  }
  if (type === "avatar") {
    return { ...element, props: { alt: "用户头像", name: "FlowMind User", src: "" } };
  }
  if (type === "button") {
    return { ...element, props: { label: "动作按钮", action: "platformApi" } };
  }
  if (type === "input") {
    return { ...element, props: { label: "输入项", placeholder: "请输入内容" } };
  }
  if (type === "textarea") {
    return { ...element, props: { label: "备注", placeholder: "请输入详细内容", rows: 4 } };
  }
  if (type === "select") {
    return { ...element, props: { label: "选择项", placeholder: "请选择", options: ["选项一", "选项二", "选项三"] } };
  }
  if (type === "checkbox") {
    return { ...element, props: { label: "同意此选项", checked: false } };
  }
  if (type === "radio") {
    return { ...element, props: { label: "单选项", value: "选项一", options: ["选项一", "选项二"] } };
  }
  if (type === "switch") {
    return { ...element, props: { label: "启用功能", checked: true } };
  }
  if (type === "badge") {
    return { ...element, props: { label: "状态标签" } };
  }
  if (type === "divider") {
    return { ...element, props: { label: "" } };
  }
  if (type === "shape") {
    const kind = definition?.shapeKind ?? "rectangle";
    return {
      ...element,
      name: definition?.label ?? "形状",
      layout: kind === "line" ? { width: "fill", height: "fixed", fixedHeight: 2 } : { width: "fixed", fixedWidth: 48, height: "fixed", fixedHeight: 48 },
      style: {
        base: baseStyle({
          backgroundColor: kind === "line" ? "border" : "brand",
          radius: kind === "circle" ? "full" : kind === "line" ? "none" : "sm",
          border: { width: "none" }
        }),
        shape: { kind, direction: "horizontal", thickness: kind === "line" ? "sm" : "md" }
      },
      props: { kind }
    };
  }
  if (type === "stat") {
    return { ...element, props: { label: "指标名称", value: "24", delta: "+6%" } };
  }
  if (type === "progress") {
    return { ...element, props: { label: "完成进度", value: 64, max: 100 } };
  }
  if (type === "filter") {
    return { ...element, layout: { display: "flex", direction: "horizontal", gap: "sm" }, props: { fields: ["stage", "owner"] } };
  }
  if (type === "table") {
    return { ...element, props: { columns: ["name", "stage", "owner", "health"] } };
  }
  if (type === "form") {
    return { ...element, props: { fields: ["name", "stage", "owner"], mode: "drawer" } };
  }
  return element;
}

function createTabsTemplate(): ComplexMaterialTemplate {
  const prefix = complexPrefix("tabs");
  const rootId = `${prefix}_root`;
  const contentId = `${prefix}_content`;
  const activeItemId = `${prefix}_active_item`;
  const activeLabelId = `${prefix}_active_label`;
  const activeTextId = `${prefix}_active_text`;
  const activeBadgeId = `${prefix}_active_badge`;
  const activeLineId = `${prefix}_active_line`;
  const followItemId = `${prefix}_follow_item`;
  const followTextId = `${prefix}_follow_text`;
  const followBadgeId = `${prefix}_follow_badge`;
  const riskItemId = `${prefix}_risk_item`;
  const riskTextId = `${prefix}_risk_text`;
  const riskBadgeId = `${prefix}_risk_badge`;
  const archivedItemId = `${prefix}_archived_item`;
  const archivedTextId = `${prefix}_archived_text`;
  return {
    root: treeNode(rootId, [treeNode(contentId, [
      treeNode(activeItemId, [treeNode(activeLabelId, [activeTextId, activeBadgeId]), activeLineId]),
      treeNode(followItemId, [followTextId, followBadgeId]),
      treeNode(riskItemId, [riskTextId, riskBadgeId]),
      treeNode(archivedItemId, [archivedTextId])
    ])]),
    selectId: rootId,
    elements: [
      complexContainerElement(rootId, "Tab 栏容器", { width: "fill", height: "fixed", fixedHeight: 44 }),
      stackElement(contentId, "Complex Material / Tab 栏", { display: "flex", direction: "horizontal", gap: "none", padding: "none", width: "fill", height: "fill" }, { backgroundColor: "muted", radius: "md", borderWidth: "sm", shadow: "none" }),
      stackElement(activeItemId, "Tab active flex item", { display: "flex", direction: "vertical", gap: "xs", align: "center", justify: "center", grow: "fill", height: "fill" }, { backgroundColor: "transparent", borderWidth: "none", shadow: "none" }),
      stackElement(activeLabelId, "Tab active label", { display: "flex", direction: "horizontal", gap: "xs", align: "center", justify: "center" }, { backgroundColor: "transparent", borderWidth: "none", shadow: "none" }),
      textElement(activeTextId, "全部客户", "Tab 文本 / 全部客户", { radius: "none", text: { color: "brand", fontSize: "sm", fontWeight: "semibold" } }),
      badgeElement(activeBadgeId, "128", "Tab 徽标 / 128", { backgroundColor: "success", textColor: "brand", soft: true }),
      shapeElement(activeLineId, "Tab active underline", "line", { backgroundColor: "brand", layout: { width: "fill", height: "fixed", fixedHeight: 2 } }),
      stackElement(followItemId, "Tab item / 重点跟进", { display: "flex", direction: "horizontal", gap: "xs", align: "center", justify: "center", grow: "fill", height: "fill" }, { backgroundColor: "transparent", borderWidth: "none", shadow: "none" }),
      textElement(followTextId, "重点跟进", "Tab 文本 / 重点跟进", { radius: "none", text: { color: "textSecondary", fontSize: "sm" } }),
      badgeElement(followBadgeId, "24", "Tab 徽标 / 24", { backgroundColor: "muted", textColor: "textSecondary", soft: true }),
      stackElement(riskItemId, "Tab item / 续约风险", { display: "flex", direction: "horizontal", gap: "xs", align: "center", justify: "center", grow: "fill", height: "fill" }, { backgroundColor: "transparent", borderWidth: "none", shadow: "none" }),
      textElement(riskTextId, "续约风险", "Tab 文本 / 续约风险", { radius: "none", text: { color: "textSecondary", fontSize: "sm" } }),
      badgeElement(riskBadgeId, "9", "Tab 徽标 / 9", { backgroundColor: "warning", textColor: "warning", soft: true }),
      stackElement(archivedItemId, "Tab item / 已归档", { display: "flex", direction: "horizontal", gap: "xs", align: "center", justify: "center", grow: "fill", height: "fill" }, { backgroundColor: "transparent", borderWidth: "none", shadow: "none" }),
      textElement(archivedTextId, "已归档", "Tab 文本 / 已归档", { radius: "none", text: { color: "textSecondary", fontSize: "sm" } })
    ]
  };
}

function createCustomerCardTemplate(): ComplexMaterialTemplate {
  const prefix = complexPrefix("customer_card");
  const rootId = `${prefix}_root`;
  const contentId = `${prefix}_content`;
  const labelRowId = `${prefix}_label_row`;
  const selectedBadgeId = `${prefix}_selected_badge`;
  const hintId = `${prefix}_hint`;
  const topGroupId = `${prefix}_top_group`;
  const avatarId = `${prefix}_avatar`;
  const textGroupId = `${prefix}_text_group`;
  const titleId = `${prefix}_title`;
  const subtitleId = `${prefix}_subtitle`;
  const metricsRowId = `${prefix}_metrics_row`;
  const amountId = `${prefix}_amount`;
  const healthId = `${prefix}_health`;
  const actionRowId = `${prefix}_action_row`;
  const tagsId = `${prefix}_tags`;
  const statusId = `${prefix}_status`;
  const levelId = `${prefix}_level`;
  const actionId = `${prefix}_action`;
  return {
    root: treeNode(rootId, [treeNode(contentId, [
      treeNode(labelRowId, [selectedBadgeId, hintId]),
      treeNode(topGroupId, [avatarId, treeNode(textGroupId, [titleId, subtitleId])]),
      treeNode(metricsRowId, [amountId, healthId]),
      treeNode(actionRowId, [treeNode(tagsId, [statusId, levelId]), actionId])
    ])]),
    selectId: rootId,
    elements: [
      complexContainerElement(rootId, "客户展示卡片容器", { width: "fixed", fixedWidth: 420, height: "fixed", fixedHeight: 204 }),
      stackElement(contentId, "Complex Material / 客户展示卡片 / selected root Flex", { display: "flex", direction: "vertical", gap: "sm", padding: "sm", width: "fill", height: "fill" }, { backgroundColor: "white", radius: "lg", borderWidth: "md", borderColor: "brand", shadow: "none" }),
      stackElement(labelRowId, "Selection root label", { display: "flex", direction: "horizontal", justify: "between", align: "center", width: "fill", height: "fixed", fixedHeight: 20 }, { backgroundColor: "transparent", borderWidth: "none", shadow: "none" }),
      badgeElement(selectedBadgeId, "根 Flex 容器", "Selected material pill", { backgroundColor: "success", textColor: "brand", soft: true }),
      textElement(hintId, "子元素可选中", "childHint", { radius: "none", text: { color: "textSecondary", fontSize: "xs" } }),
      stackElement(topGroupId, "Customer top editable group", { display: "flex", direction: "horizontal", gap: "sm", align: "center", width: "fill", height: "fixed", fixedHeight: 54 }, { backgroundColor: "transparent", borderWidth: "none", shadow: "none" }),
      imageElement(avatarId, "基础物料 / 图片", { layout: { width: "fixed", fixedWidth: 48, height: "fixed", fixedHeight: 48 }, radius: "lg", backgroundColor: "success", borderColor: "brand" }),
      stackElement(textGroupId, "基础物料 / 文本组", { display: "flex", direction: "vertical", gap: "xs", grow: "fill" }, { backgroundColor: "transparent", borderWidth: "none", shadow: "none" }),
      textElement(titleId, "未来数据智能集团", "客户名称", { radius: "none", text: { fontSize: "sm", fontWeight: "bold" } }),
      textElement(subtitleId, "负责人：Ada · 最新联系：今天 10:24", "客户说明", { radius: "none", text: { color: "textSecondary", fontSize: "xs" } }),
      stackElement(metricsRowId, "基础物料 / 指标卡 row", { display: "flex", direction: "horizontal", gap: "sm", width: "fill", height: "fixed", fixedHeight: 52 }, { backgroundColor: "transparent", borderWidth: "none", shadow: "none" }),
      statElement(amountId, "合同金额", "¥128.6万", "本季度", { compact: true }),
      statElement(healthId, "客户健康度", "92 / 100", "稳定", { compact: true }),
      stackElement(actionRowId, "Customer action row", { display: "flex", direction: "horizontal", justify: "between", align: "center", width: "fill", height: "fixed", fixedHeight: 28 }, { backgroundColor: "transparent", borderWidth: "none", shadow: "none" }),
      stackElement(tagsId, "Editable tags", { display: "flex", direction: "horizontal", gap: "xs", align: "center" }, { backgroundColor: "transparent", borderWidth: "none", shadow: "none" }),
      badgeElement(statusId, "战略客户", "基础物料 / 徽标 战略客户", { backgroundColor: "success", textColor: "brand", soft: true }),
      badgeElement(levelId, "高潜", "基础物料 / 徽标 高潜", { backgroundColor: "warning", textColor: "warning", soft: true }),
      buttonElement(actionId, "设置", "基础物料 / 按钮", "primary", "sm")
    ]
  };
}

function createMetricGroupTemplate(): ComplexMaterialTemplate {
  const prefix = complexPrefix("metric_group");
  const rootId = `${prefix}_root`;
  const contentId = `${prefix}_content`;
  const leadId = `${prefix}_leads`;
  const valueId = `${prefix}_value`;
  const healthId = `${prefix}_health`;
  const conversionId = `${prefix}_conversion`;
  return {
    root: treeNode(rootId, [treeNode(contentId, [leadId, valueId, healthId, conversionId])]),
    selectId: rootId,
    elements: [
      complexContainerElement(rootId, "指标总览卡片组容器", { width: "fill", height: "fixed", fixedHeight: 108 }),
      stackElement(contentId, "Complex Material / 指标总览卡片组", { display: "flex", direction: "horizontal", gap: "sm", padding: "none", width: "fill", height: "fill", wrap: true }, { backgroundColor: "transparent", borderWidth: "none", shadow: "none" }),
      statElement(leadId, "本月新增客户", "482", "+12.4% 较上月", { tone: "success" }),
      statElement(valueId, "合同金额", "¥ 826万", "稳定达成 87%", { tone: "textSecondary" }),
      statElement(healthId, "待审批合同", "17", "6 个超 24h", { tone: "warning" }),
      statElement(conversionId, "客户活跃率", "73.8%", "高于目标 3.8%", { tone: "brand" })
    ]
  };
}

function createSearchToolbarTemplate(): ComplexMaterialTemplate {
  const prefix = complexPrefix("search_toolbar");
  const rootId = `${prefix}_root`;
  const contentId = `${prefix}_content`;
  const inputId = `${prefix}_keyword`;
  const filterId = `${prefix}_filter`;
  const statusId = `${prefix}_status`;
  const queryId = `${prefix}_query`;
  const resetId = `${prefix}_reset`;
  return {
    root: treeNode(rootId, [treeNode(contentId, [inputId, filterId, statusId, queryId, resetId])]),
    selectId: rootId,
    elements: [
      complexContainerElement(rootId, "搜索筛选工具栏容器", { width: "fill", height: "fixed", fixedHeight: 48 }),
      stackElement(contentId, "Complex Material / 搜索筛选工具栏", { display: "flex", direction: "horizontal", gap: "sm", padding: "sm", align: "center", width: "fill", height: "fill", wrap: true }, { backgroundColor: "muted", radius: "md", borderWidth: "sm", shadow: "none" }),
      inputElement(inputId, "基础物料 / 输入框", "搜索客户名称 / 负责人", { layout: { width: "fixed", fixedWidth: 320, height: "fixed", fixedHeight: 32 }, compact: true }),
      filterElement(filterId, ["状态：全部", "负责人：全部"], { compact: true }),
      badgeElement(statusId, "已启用筛选", "筛选状态", { backgroundColor: "success", textColor: "brand", soft: true }),
      buttonElement(queryId, "查询", "基础物料 / 按钮 查询", "primary", "sm"),
      buttonElement(resetId, "重置", "基础物料 / 按钮 重置", "secondary", "sm")
    ]
  };
}

function createTableSectionTemplate(): ComplexMaterialTemplate {
  const prefix = complexPrefix("table_section");
  const rootId = `${prefix}_root`;
  const contentId = `${prefix}_content`;
  const headerId = `${prefix}_header`;
  const titleId = `${prefix}_title`;
  const actionId = `${prefix}_action`;
  const descId = `${prefix}_desc`;
  const filterId = `${prefix}_filter`;
  const tableId = `${prefix}_table`;
  const importId = `${prefix}_import`;
  return {
    root: treeNode(rootId, [treeNode(contentId, [treeNode(headerId, [treeNode(`${prefix}_title_wrap`, [titleId, descId]), treeNode(`${prefix}_actions`, [importId, actionId])]), filterId, tableId])]),
    selectId: rootId,
    elements: [
      complexContainerElement(rootId, "表格业务区块容器", { width: "fill", height: "fixed", fixedHeight: 392 }),
      stackElement(contentId, "Complex Material / 表格业务区块", { display: "flex", direction: "vertical", gap: "sm", padding: "sm", width: "fill", height: "fill" }, { backgroundColor: "white", radius: "lg", borderWidth: "sm", shadow: "none" }),
      stackElement(headerId, "Table block header", { display: "flex", direction: "horizontal", gap: "md", align: "center", justify: "between", width: "fill", height: "fixed", fixedHeight: 34 }, { backgroundColor: "transparent", borderWidth: "none", shadow: "none" }),
      stackElement(`${prefix}_title_wrap`, "Table title wrap", { display: "flex", direction: "vertical", gap: "none" }, { backgroundColor: "transparent", borderWidth: "none", shadow: "none" }),
      textElement(titleId, "重点客户列表", "tableTitle", { radius: "none", text: { fontSize: "md", fontWeight: "bold" } }),
      textElement(descId, "由文本、按钮、筛选区、数据表格组合", "tableDesc", { radius: "none", text: { color: "textSecondary", fontSize: "xs" } }),
      stackElement(`${prefix}_actions`, "Table actions", { display: "flex", direction: "horizontal", gap: "sm", align: "center" }, { backgroundColor: "transparent", borderWidth: "none", shadow: "none" }),
      buttonElement(importId, "导入", "基础物料 / 按钮 导入", "secondary", "sm"),
      buttonElement(actionId, "新增客户", "基础物料 / 按钮 新增", "primary", "sm"),
      filterElement(filterId, ["最近 30 天", "客户等级"], { compact: true, activeLabel: "已启用 2 个筛选" }),
      tableElement(tableId, ["name", "health", "amount", "owner", "action"], { compact: true })
    ]
  };
}

function createApprovalCardTemplate(): ComplexMaterialTemplate {
  const prefix = complexPrefix("approval_card");
  const rootId = `${prefix}_root`;
  const contentId = `${prefix}_content`;
  const titleId = `${prefix}_title`;
  const step1Id = `${prefix}_step_submitted`;
  const divider1Id = `${prefix}_divider_review`;
  const step2Id = `${prefix}_step_review`;
  const divider2Id = `${prefix}_divider_confirm`;
  const step3Id = `${prefix}_step_confirm`;
  const divider3Id = `${prefix}_divider_archive`;
  const step4Id = `${prefix}_step_archive`;
  const statusId = `${prefix}_status`;
  return {
    root: treeNode(rootId, [treeNode(contentId, [treeNode(`${prefix}_header`, [titleId, statusId]), treeNode(`${prefix}_steps`, [step1Id, divider1Id, step2Id, divider2Id, step3Id, divider3Id, step4Id])])]),
    selectId: rootId,
    elements: [
      complexContainerElement(rootId, "审批进度卡片容器", { width: "fill", height: "fixed", fixedHeight: 188, grow: "fill" }),
      stackElement(contentId, "Complex Material / 审批进度卡片", { display: "flex", direction: "vertical", gap: "sm", padding: "sm", width: "fill", height: "fill" }, { backgroundColor: "white", radius: "lg", borderWidth: "sm", shadow: "none" }),
      stackElement(`${prefix}_header`, "Approval header", { display: "flex", direction: "horizontal", justify: "between", align: "center", width: "fill", height: "fixed", fixedHeight: 24 }, { backgroundColor: "transparent", borderWidth: "none", shadow: "none" }),
      textElement(titleId, "合同审批进度", "approvalTitle", { radius: "none", text: { fontSize: "sm", fontWeight: "bold" } }),
      badgeElement(statusId, "进行中", "基础物料 / 徽标 进行中", { backgroundColor: "warning", textColor: "warning", soft: true }),
      stackElement(`${prefix}_steps`, "Approval steps", { display: "flex", direction: "vertical", gap: "xs", width: "fill", grow: "fill" }, { backgroundColor: "transparent", borderWidth: "none", shadow: "none" }),
      approvalStepElement(step1Id, "步骤 1", "已提交 · Ada", "今天 09:30", "success"),
      shapeElement(divider1Id, "审批分割线 1", "line", { backgroundColor: "border", layout: { width: "fill", height: "fixed", fixedHeight: 1 } }),
      approvalStepElement(step2Id, "步骤 2", "部门审核 · Ben", "今天 11:00", "success"),
      shapeElement(divider2Id, "审批分割线 2", "line", { backgroundColor: "border", layout: { width: "fill", height: "fixed", fixedHeight: 1 } }),
      approvalStepElement(step3Id, "步骤 3 active", "财务复核 · Chen", "等待处理", "warning"),
      shapeElement(divider3Id, "审批分割线 3", "line", { backgroundColor: "border", layout: { width: "fill", height: "fixed", fixedHeight: 1 } }),
      approvalStepElement(step4Id, "步骤 4", "合同归档 · 系统", "未开始", "textSecondary")
    ]
  };
}

function cloneComplexMaterialTemplate(template: ComplexMaterialTemplate, idSeed: string): ComplexMaterialTemplate {
  const prefix = `node_complex_${sanitizeIdPart(idSeed)}_${Math.random().toString(36).slice(2, 8)}`;
  const idMap = new Map<string, string>();
  let index = 0;
  const resolveId = (id: string) => {
    const existing = idMap.get(id);
    if (existing) return existing;
    const next = id === template.root.id
      ? `${prefix}_root`
      : id === template.root.children?.[0]?.id
        ? `${prefix}_content`
        : `${prefix}_${sanitizeIdPart(id)}_${index++}`;
    idMap.set(id, next);
    return next;
  };
  const cloneNode = (node: DesignTreeNode): DesignTreeNode => ({
    id: resolveId(node.id),
    children: (node.children ?? []).map(cloneNode)
  });
  return {
    root: cloneNode(template.root),
    selectId: template.selectId ? resolveId(template.selectId) : undefined,
    elements: template.elements.map((element) => ({
      ...element,
      id: resolveId(element.id)
    }))
  };
}

function isCustomComplexMaterialRecord(value: unknown): value is CustomComplexMaterialRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<CustomComplexMaterialRecord>;
  return typeof record.id === "string"
    && record.id.startsWith("custom_")
    && typeof record.label === "string"
    && typeof record.desc === "string"
    && record.category === "自定义"
    && Array.isArray(record.composition)
    && Boolean(record.template?.root?.id)
    && Array.isArray(record.template?.elements);
}

function compositionForElements(elements: DesignElement[]) {
  const labels: Record<DesignElementType, string> = {
    page: "页面",
    section: "区块",
    stack: "Flex",
    text: "文本",
    link: "链接",
    image: "图片",
    avatar: "头像",
    button: "按钮",
    input: "输入框",
    textarea: "文本域",
    select: "选择器",
    checkbox: "复选框",
    radio: "单选组",
    switch: "开关",
    badge: "徽标",
    divider: "分割线",
    shape: "形状",
    progress: "进度条",
    stat: "指标卡",
    filter: "筛选区",
    table: "数据表格",
    form: "表单"
  };
  return Array.from(new Set(elements.map((element) => labels[element.type] ?? element.type)));
}

function sanitizeIdPart(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 32) || "item";
}

function complexPrefix(id: string) {
  return `node_complex_${id}_${Math.random().toString(36).slice(2, 8)}`;
}

function treeNode(id: string, children: Array<string | DesignTreeNode> = []): DesignTreeNode {
  return {
    id,
    children: children.map((child) => typeof child === "string" ? { id: child, children: [] } : child)
  };
}

function complexContainerElement(id: string, name: string, layout: DesignLayout): DesignElement {
  const { fixedHeight: _fixedHeight, ...restLayout } = layout;
  return stackElement(
    id,
    name,
    { display: "flex", direction: "vertical", gap: "none", padding: "none", ...restLayout, height: "fill" },
    { backgroundColor: "transparent", radius: "none", borderWidth: "none", shadow: "none" }
  );
}

function stackElement(
  id: string,
  name: string,
  layout: DesignLayout,
  options: { backgroundColor?: DesignBaseStyle["backgroundColor"]; radius?: DesignBaseStyle["radius"]; borderWidth?: DesignBaseStyle["border"]["width"]; borderColor?: DesignBaseStyle["border"]["color"]; borderStyle?: DesignBaseStyle["border"]["style"]; shadow?: "none" | "sm" | "md" | "lg" } = {}
): DesignElement {
  return withDefaultStyle({
    id,
    type: "stack",
    name,
    layout,
    style: {
      base: baseStyle({
        backgroundColor: options.backgroundColor ?? "white",
        radius: options.radius ?? "md",
        border: { width: options.borderWidth ?? "sm", color: options.borderColor ?? "border", style: options.borderStyle ?? "solid" }
      }),
      container: { shadow: options.shadow ?? "sm", overflow: "visible", surface: "card" }
    },
    props: {}
  });
}

function textElement(id: string, text: string, name: string, baseOverrides: Parameters<typeof baseStyle>[0] = {}): DesignElement {
  return withDefaultStyle({
    id,
    type: "text",
    name,
    style: {
      base: baseStyle({ radius: "sm", text: { fontSize: "md", fontWeight: "medium" }, ...baseOverrides }),
      text: { role: "body", decoration: "none", transform: "none" }
    },
    props: { text }
  });
}

function imageElement(id: string, name: string, options: { layout?: DesignLayout; radius?: DesignBaseStyle["radius"]; backgroundColor?: DesignBaseStyle["backgroundColor"]; borderColor?: DesignBaseStyle["border"]["color"] } = {}): DesignElement {
  return withDefaultStyle({
    id,
    type: "image",
    name,
    layout: options.layout,
    style: {
      base: baseStyle({ backgroundColor: options.backgroundColor ?? "muted", radius: options.radius ?? "lg", border: { width: "sm", color: options.borderColor ?? "border" } }),
      image: { aspectRatio: "square", objectFit: "cover" }
    },
    props: { alt: name, src: DEFAULT_LOW_CODE_IMAGE_URL }
  });
}

function badgeElement(id: string, label: string, name: string, options: { backgroundColor?: DesignBaseStyle["backgroundColor"]; textColor?: DesignBaseStyle["text"]["color"]; soft?: boolean } = {}): DesignElement {
  return withDefaultStyle({
    id,
    type: "badge",
    name,
    style: {
      base: baseStyle({
        backgroundColor: options.soft ? "muted" : options.backgroundColor ?? "success",
        radius: "md",
        border: { width: "none" },
        text: { color: options.textColor ?? "white", fontSize: "xs", fontWeight: "medium" }
      }),
      badge: { size: "sm", shape: "square", emphasis: options.soft ? "soft" : "solid" }
    },
    props: { label }
  });
}

function statElement(id: string, label: string, value: string, delta: string, options: { tone?: DesignBaseStyle["text"]["color"]; compact?: boolean } = {}): DesignElement {
  return withDefaultStyle({
    id,
    type: "stat",
    name: label,
    layout: { grow: "fill", height: "fill" },
    style: {
      base: baseStyle({ backgroundColor: "muted", radius: "md", border: { width: "sm" }, text: { color: options.tone ?? "textSecondary", fontSize: "xs" } }),
      stat: { valueSize: options.compact ? "md" : "xl", trendPosition: "below" }
    },
    props: { label, value, delta, compact: options.compact, tone: options.tone }
  });
}

function buttonElement(id: string, label: string, name: string, emphasis: "primary" | "secondary" | "ghost" = "primary", size: "sm" | "md" | "lg" = "md"): DesignElement {
  return withDefaultStyle({
    id,
    type: "button",
    name,
    style: {
      base: baseStyle({ backgroundColor: emphasis === "primary" ? "brand" : "white", radius: "md", border: { width: emphasis === "primary" ? "none" : "sm" }, text: { color: emphasis === "primary" ? "white" : "textPrimary", fontWeight: "semibold" } }),
      button: { size, emphasis }
    },
    props: { label, action: "platformApi" }
  });
}

function inputElement(id: string, label: string, placeholder: string, options: { layout?: DesignLayout; compact?: boolean } = {}): DesignElement {
  return withDefaultStyle({
    id,
    type: "input",
    name: label,
    layout: options.layout ?? { grow: "fill" },
    style: {
      base: baseStyle({ backgroundColor: "white", radius: "md", border: { width: "sm" }, text: { color: "textSecondary", fontSize: "xs" } }),
      control: { size: options.compact ? "sm" : "md", labelPosition: options.compact ? "hidden" : "top", fieldGap: "xs" }
    },
    props: { label, placeholder, compact: options.compact }
  });
}

function filterElement(id: string, fields: string[], options: { compact?: boolean; activeLabel?: string } = {}): DesignElement {
  return withDefaultStyle({
    id,
    type: "filter",
    name: "基础物料 / 筛选区",
    layout: { display: "flex", direction: "horizontal", gap: "sm", grow: "fill", height: options.compact ? "fill" : undefined },
    style: {
      base: baseStyle({ backgroundColor: options.compact ? "muted" : "white", radius: "md", border: { width: options.compact ? "none" : "sm" } }),
      control: { size: options.compact ? "sm" : "md", labelPosition: "hidden", fieldGap: "sm" }
    },
    props: { fields, compact: options.compact, activeLabel: options.activeLabel }
  });
}

function tableElement(id: string, columns: string[], options: { compact?: boolean } = {}): DesignElement {
  return withDefaultStyle({
    id,
    type: "table",
    name: "基础物料 / 数据表格",
    layout: options.compact ? { grow: "fill", height: "fill" } : undefined,
    style: {
      base: baseStyle({ backgroundColor: "white", radius: "md", border: { width: "sm" } }),
      table: { density: options.compact ? "compact" : "default", zebra: false, headerBackground: "muted", borderMode: "rows" }
    },
    props: { columns, compact: options.compact }
  });
}

function dividerElement(id: string, name: string): DesignElement {
  return withDefaultStyle({
    id,
    type: "divider",
    name,
    props: { label: "" }
  });
}

function shapeElement(
  id: string,
  name: string,
  kind: "rectangle" | "circle" | "line",
  options: { backgroundColor?: DesignBaseStyle["backgroundColor"]; direction?: "horizontal" | "vertical"; layout?: DesignLayout } = {}
): DesignElement {
  return withDefaultStyle({
    id,
    type: "shape",
    name,
    layout: options.layout ?? (kind === "line" ? { width: "fill", height: "fixed", fixedHeight: 1 } : { width: "fixed", fixedWidth: 12, height: "fixed", fixedHeight: 12 }),
    style: {
      base: baseStyle({ backgroundColor: options.backgroundColor ?? "brand", radius: kind === "circle" ? "full" : kind === "line" ? "none" : "sm", border: { width: "none" } }),
      shape: { kind, direction: options.direction ?? "horizontal", thickness: "sm" }
    },
    props: { kind }
  });
}

function approvalStepElement(id: string, name: string, label: string, meta: string, tone: DesignBaseStyle["text"]["color"]): DesignElement {
  return textElement(id, `${label} · ${meta}`, name, { radius: "none", text: { color: tone, fontSize: "xs", fontWeight: tone === "warning" ? "semibold" : "regular" } });
}

export function createImageElementFromAsset(asset: LowCodeImageAsset): DesignElement {
  return withDefaultStyle({
    id: `node_image_${Math.random().toString(36).slice(2, 8)}`,
    type: "image",
    name: asset.name,
    props: { alt: asset.name, src: asset.url, assetKey: asset.key }
  });
}

export function isContainerElement(type: DesignElementType) {
  return type === "page" || type === "section" || type === "stack";
}

export function getTreeIds(node: DesignTreeNode): string[] {
  return [node.id, ...(node.children ?? []).flatMap(getTreeIds)];
}
