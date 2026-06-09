import {
  BadgeCheck,
  BarChart3,
  FileText,
  Filter,
  Image,
  PanelRight,
  RectangleHorizontal,
  Save,
  Table2,
  Type,
  type LucideIcon
} from "lucide-react";
import type { DesignBaseStyle, DesignDocument, DesignElement, DesignElementStyle, DesignElementType, DesignTreeNode, LowCodeImageAsset } from "@flowmind/shared";

export type MaterialDefinition = {
  type: Exclude<DesignElementType, "page">;
  label: string;
  desc: string;
  icon: LucideIcon;
};

export const materialCategories: Array<{ title: string; items: MaterialDefinition[] }> = [
  {
    title: "布局",
    items: [
      { type: "stack", label: "Flex 容器", desc: "横向或纵向排列子元素", icon: FileText }
    ]
  },
  {
    title: "基础",
    items: [
      { type: "text", label: "文本", desc: "标题、正文、辅助说明", icon: Type },
      { type: "button", label: "按钮", desc: "主按钮、次按钮、动作入口", icon: Save },
      { type: "image", label: "图片", desc: "封面、产品图、头像区域", icon: Image },
      { type: "badge", label: "徽标", desc: "状态、标签、轻量提示", icon: BadgeCheck }
    ]
  },
  {
    title: "表单",
    items: [
      { type: "input", label: "输入框", desc: "文本输入或搜索框", icon: RectangleHorizontal },
      { type: "filter", label: "筛选区", desc: "搜索、选择器、日期范围", icon: Filter },
      { type: "form", label: "表单区块", desc: "字段布局、校验、提交", icon: PanelRight }
    ]
  },
  {
    title: "数据展示",
    items: [
      { type: "stat", label: "指标卡", desc: "数值、趋势和状态", icon: BarChart3 },
      { type: "table", label: "数据表格", desc: "列配置、分页、行操作", icon: Table2 }
    ]
  }
];

export const materials = materialCategories.flatMap((category) => category.items);
export const aiActions = ["AI 总结字段", "调用 CRM 查询", "生成审批流"];
export const DEFAULT_LOW_CODE_IMAGE_URL = "https://flowmindstudio.oss-cn-beijing.aliyuncs.com/low-code/backgrounds/default-customer-admin.png";

export const availableFields = ["name", "stage", "owner", "health", "lastContact", "amount"];

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
  if (element.type === "text") {
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
  if (element.type === "button") {
    return {
      base: baseStyle({ backgroundColor: "brand", radius: "md", border: { width: "none" }, text: { color: "white", fontWeight: "semibold" } }),
      button: { size: "md", emphasis: "primary" }
    };
  }
  if (element.type === "input" || element.type === "filter" || element.type === "form") {
    return { base: baseStyle({ backgroundColor: "white", radius: "md", border: { width: "sm" } }), control: { size: "md", labelPosition: "top", fieldGap: "sm" } };
  }
  if (element.type === "badge") {
    return { base: baseStyle({ backgroundColor: "success", radius: "md", border: { width: "sm" }, text: { color: "white", fontSize: "xs", fontWeight: "bold" } }), badge: { size: "md", shape: "square", emphasis: "soft" } };
  }
  if (element.type === "divider") {
    return { base: baseStyle({ backgroundColor: "transparent", radius: "none", border: { width: "sm" }, text: { color: "textSecondary", fontSize: "xs", fontWeight: "semibold" } }), divider: { direction: "horizontal", thickness: "sm", labelPosition: "center" } };
  }
  if (element.type === "stat") {
    return { base: baseStyle({ backgroundColor: "muted", radius: "lg", border: { width: "sm" } }), stat: { valueSize: "xl", trendPosition: "below" } };
  }
  return { base: baseStyle({ backgroundColor: "white", radius: "lg", border: { width: "sm" } }), table: { density: "default", zebra: false, headerBackground: "muted", borderMode: "rows" } };
}

function styleProps(element: DesignElementSeed): Record<string, unknown> {
  return { ...element.props };
}

function withDefaultStyle(element: DesignElementSeed): DesignElement {
  const { style, ...rest } = element;
  return { ...rest, props: styleProps(element), style: style ?? defaultStyleForElement(element) } as DesignElement;
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
      props: { text: "客户管理", description: "查看客户阶段、负责人和健康度，快速生成后续跟进动作。" }
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

export function createElementFromMaterial(type: MaterialDefinition["type"]): DesignElement {
  const legacy = createElementFromMaterialLegacy(type);
  return withDefaultStyle(legacy);
}

function createElementFromMaterialLegacy(type: MaterialDefinition["type"]): DesignElementSeed {
  const id = `node_${type}_${Math.random().toString(36).slice(2, 8)}`;
  const base = materials.find((item) => item.type === type);
  const name = base?.label ?? type;
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
    return { ...element, props: { text: "新的文本内容", description: "" } };
  }
  if (type === "image") {
    return { ...element, props: { alt: "图片占位", src: DEFAULT_LOW_CODE_IMAGE_URL } };
  }
  if (type === "button") {
    return { ...element, props: { label: "动作按钮", action: "platformApi" } };
  }
  if (type === "input") {
    return { ...element, props: { label: "输入项", placeholder: "请输入内容" } };
  }
  if (type === "badge") {
    return { ...element, props: { label: "状态标签" } };
  }
  if (type === "divider") {
    return { ...element, props: { label: "" } };
  }
  if (type === "stat") {
    return { ...element, props: { label: "指标名称", value: "24", delta: "+6%" } };
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
