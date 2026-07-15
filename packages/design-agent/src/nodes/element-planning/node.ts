import type { DesignDocument } from "@flowmind/shared";

import type { DesignAgentState } from "../../state.js";
import { buildContentPlan } from "../content-planning/node.js";
import { contentPlanSchema, type ContentPlan } from "../content-planning/schema.js";
import { readDocumentFromLatestArtifact, writePipelineArtifact } from "../document-pipeline.js";
import type { GraphNodeOptions } from "../types.js";
import { compileSemanticElementPlan } from "./compiler.js";
import { elementPlanningPrompt } from "./prompt.js";
import {
  elementPlanningModelOutputSchema,
  type ElementPlan,
  type ElementPlanningOutput,
} from "./schema.js";

export async function elementPlanningNode(state: DesignAgentState, options: GraphNodeOptions): Promise<Partial<DesignAgentState>> {
  const { document, inputRefs } = await readDocumentFromLatestArtifact(state, options, "visual_slot_review");
  const contentPlan = await readContentPlan(state, options);
  const planned = await createElementDocument(state, document, contentPlan, options);
  const output: ElementPlanningOutput = {
    document: planned.document,
    elementPlan: planned.elementPlan,
  };

  return writePipelineArtifact({
    state,
    options,
    node: "element_planning",
    stage: "element_planning",
    inputRefs,
    output,
    errors: planned.errors,
  });
}

async function createElementDocument(
  state: DesignAgentState,
  document: DesignDocument,
  contentPlan: ContentPlan,
  options: GraphNodeOptions,
) {
  const fallback = fallbackElementPlan(state, document, contentPlan);
  if (!options.createStructuredOutput) {
    return { elementPlan: fallback, document: compileSemanticElementPlan(document, fallback), errors: [] };
  }

  try {
    const elementPlan = validateElementQuality(
      await invokeElementModel(options, buildElementPlanningInput(state, document, contentPlan)),
      contentPlan,
      document,
    );
    return { elementPlan, document: compileSemanticElementPlan(document, elementPlan), errors: [] };
  } catch (firstError) {
    try {
      const elementPlan = await invokeElementModel(
        options,
        buildElementRetryInput(state, document, contentPlan, firstError),
      );
      const validated = validateElementQuality(elementPlan, contentPlan, document);
      return { elementPlan: validated, document: compileSemanticElementPlan(document, validated), errors: [] };
    } catch (retryError) {
      const errors = [`${formatDiagnosticError(firstError)}\nRetry failed: ${formatDiagnosticError(retryError)}`];
      return {
        elementPlan: fallback,
        document: compileSemanticElementPlan(document, fallback),
        errors,
      };
    }
  }
}

async function invokeElementModel(options: GraphNodeOptions, input: string): Promise<ElementPlan> {
  if (!options.createStructuredOutput) throw new Error("Structured output model is unavailable.");
  const output = elementPlanningModelOutputSchema.parse(
    await options.createStructuredOutput(elementPlanningModelOutputSchema, { node: "element_planning" }).invoke(input),
  );
  return output.elementPlan;
}

export function buildElementPlanningInput(
  state: DesignAgentState,
  document: DesignDocument,
  contentPlan = buildContentPlan(state),
): string {
  return [
    elementPlanningPrompt,
    "",
    "Confirmed intent dimensions:",
    JSON.stringify(state.dimensions, null, 2),
    "",
    "Content narrative blueprint and required density:",
    JSON.stringify(contentPlan, null, 2),
    "",
    "Layout planning artifact ref:",
    JSON.stringify(state.latestArtifactRefs.visual_slot_review ?? null, null, 2),
    "",
    "Available parent containers:",
    JSON.stringify(containerSummaries(document), null, 2),
    "",
    "Current structure tree:",
    JSON.stringify(document.tree, null, 2),
  ].join("\n");
}

function buildElementRetryInput(
  state: DesignAgentState,
  document: DesignDocument,
  contentPlan: ContentPlan,
  error: unknown,
) {
  return [
    buildElementPlanningInput(state, document, contentPlan),
    "",
    "The previous element plan was rejected by schema or reference validation.",
    `Validation error: ${summarizeError(error)}`,
    "Generate the complete flat elementPlan again. Use only the listed parent container ids and satisfy every content quality target.",
    "Do not create image elements for reviewed image slots; those already exist in the document.",
    "Use this object only as a shape example and replace its content for the confirmed intent:",
    JSON.stringify(exampleElementPlan(document), null, 2),
  ].join("\n");
}

function containerSummaries(document: DesignDocument) {
  return document.elements
    .filter((element) => element.type === "page" || element.type === "section" || element.type === "stack")
    .map((element) => ({
      id: element.id,
      name: element.name,
      type: element.type,
      purpose: element.props.purpose ?? null,
    }));
}

type ContainerSummary = ReturnType<typeof containerSummaries>[number];

type ProductFallbackParents = {
  heroCopy: string;
  heroActions: string;
  proofIntro: string;
  proofMetrics: string;
  featuresIntro: string;
  featureCards: [string, string, string];
  storyCopy: string;
  specificationsIntro: string;
  specificationsGrid: string;
  specificationItems: [string, string, string];
  socialIntro: string;
  socialGrid: string;
  testimonialCards: [string, string, string];
  ctaCopy: string;
  ctaActions: string;
};

type GeneralFallbackParents = {
  heroCopy: string;
  contentHeading: string;
  contentBody: string;
  actionsHeading: string;
  actionsCta: string;
};

function exampleElementPlan(document: DesignDocument): ElementPlan {
  const parent = containerSummaries(document).find((element) => element.type !== "page")
    ?? containerSummaries(document)[0];
  return {
    elements: parent ? [{
      id: "example_heading",
      parentId: parent.id,
      order: 0,
      type: "text",
      name: "Example Heading",
      purpose: "Introduce this region",
      content: "Example heading",
      attributes: [{ key: "role", value: "heading" }],
    }] : [],
    notes: ["Replace the example with intent-specific elements."],
  };
}

export function fallbackElementPlan(
  state: Pick<DesignAgentState, "messages">,
  document: DesignDocument,
  contentPlan: ContentPlan,
): ElementPlan {
  if (contentPlan.archetype === "product_marketing") {
    return productFallbackElementPlan(state, contentPlan.subject, resolveProductFallbackParents(document));
  }
  if (contentPlan.archetype === "operational" && document.elements.some((element) => element.id === "filters_section")) {
    return operationalFallbackElementPlan(state, contentPlan.subject);
  }
  if (contentPlan.archetype === "general") {
    const generalFallback = generalFallbackElementPlan(state, contentPlan.subject, resolveGeneralFallbackParents(document));
    if (generalFallback.elements.length > 0) return generalFallback;
  }
  const parent = containerSummaries(document).find((element) => element.type === "stack")
    ?? containerSummaries(document).find((element) => element.type === "section")
    ?? containerSummaries(document)[0];
  return {
    elements: parent ? [
      leaf("fallback_title", parent.id, 0, "text", "Page Title", "Introduce the requested experience", contentPlan.subject, [{ key: "role", value: "heading" }]),
      leaf("fallback_body", parent.id, 1, "text", "Page Introduction", "Explain the primary value and context", contentPlan.narrative),
      leaf("fallback_action", parent.id, 2, "button", "Primary Action", "Provide a clear next action", "Continue"),
    ] : [],
    notes: ["Deterministic fallback supplies a usable title, supporting copy, and primary action."],
  };
}

export function validateElementQuality(plan: ElementPlan, contentPlan: ContentPlan, document?: DesignDocument): ElementPlan {
  if (contentPlan.archetype === "operational") {
    const count = (type: ElementPlan["elements"][number]["type"]) => plan.elements.filter((element) => element.type === type).length;
    const requirements: Array<[ElementPlan["elements"][number]["type"], number]> = [
      ["text", contentPlan.qualityTargets.minimumTextElements],
      ["button", contentPlan.qualityTargets.minimumActions],
      ["stat", contentPlan.qualityTargets.minimumStats],
      ["filter", 1],
      ["table", 1],
      ["form", 1],
    ];
    for (const [type, minimum] of requirements) {
      if (count(type) < minimum) throw new Error(`Operational element plan requires at least ${minimum} ${type} elements; received ${count(type)}.`);
    }
    if (count("image") > contentPlan.qualityTargets.maximumImages) {
      throw new Error("Operational element plan must not add decorative generated images.");
    }
    for (const parentId of ["header_content", "filters_row", "metrics_grid", "table_content", "form_content", "action_row"]) {
      if (!plan.elements.some((element) => element.parentId === parentId)) {
        throw new Error(`Operational element plan leaves required content group empty: ${parentId}`);
      }
    }
    return plan;
  }
  if (contentPlan.archetype === "general") {
    const count = (type: ElementPlan["elements"][number]["type"]) => plan.elements.filter((element) => element.type === type).length;
    if (count("text") < contentPlan.qualityTargets.minimumTextElements) {
      throw new Error(`General element plan requires at least ${contentPlan.qualityTargets.minimumTextElements} text elements; received ${count("text")}.`);
    }
    if (count("button") < contentPlan.qualityTargets.minimumActions) {
      throw new Error(`General element plan requires at least ${contentPlan.qualityTargets.minimumActions} actions; received ${count("button")}.`);
    }
    if (count("image") > contentPlan.qualityTargets.maximumImages) {
      throw new Error(`General element plan must not exceed ${contentPlan.qualityTargets.maximumImages} image elements.`);
    }
    if (document) {
      const parents = resolveGeneralFallbackParents(document);
      for (const parentId of Array.from(new Set([parents.heroCopy, parents.contentHeading, parents.contentBody, parents.actionsHeading, parents.actionsCta]))) {
        if (!plan.elements.some((element) => element.parentId === parentId)) {
          throw new Error(`General element plan leaves required content group empty: ${parentId}`);
        }
      }
    }
    return plan;
  }
  if (contentPlan.archetype !== "product_marketing") return plan;
  const count = (type: ElementPlan["elements"][number]["type"]) => plan.elements.filter((element) => element.type === type).length;
  const textCount = count("text");
  const actionCount = count("button");
  const statCount = count("stat");
  const imageCount = count("image");
  if (textCount < contentPlan.qualityTargets.minimumTextElements) {
    throw new Error(`Product element plan requires at least ${contentPlan.qualityTargets.minimumTextElements} text elements; received ${textCount}.`);
  }
  if (actionCount < contentPlan.qualityTargets.minimumActions || statCount < contentPlan.qualityTargets.minimumStats) {
    throw new Error(`Product element plan requires ${contentPlan.qualityTargets.minimumActions} actions and ${contentPlan.qualityTargets.minimumStats} stats; received ${actionCount} and ${statCount}.`);
  }
  if (imageCount > 0) {
    throw new Error("Product element plan must use reviewed image slots instead of creating duplicate image elements.");
  }
  if (document) {
    const parents = resolveProductFallbackParents(document);
    const requiredParents = Array.from(new Set([
      parents.heroCopy,
      parents.heroActions,
      parents.proofIntro,
      parents.proofMetrics,
      parents.featuresIntro,
      ...parents.featureCards,
      parents.storyCopy,
      parents.specificationsIntro,
      parents.specificationsGrid,
      ...parents.specificationItems,
      parents.socialIntro,
      parents.socialGrid,
      ...parents.testimonialCards,
      parents.ctaCopy,
      parents.ctaActions,
    ]));
    for (const parentId of requiredParents) {
      if (!plan.elements.some((element) => element.parentId === parentId)) {
        throw new Error(`Product element plan leaves required content group empty: ${parentId}`);
      }
    }
  }
  return plan;
}

function operationalFallbackElementPlan(state: Pick<DesignAgentState, "messages">, subject: string): ElementPlan {
  const chinese = state.messages.some((message) => /[\u3400-\u9fff]/u.test(message.content));
  const copy = chinese ? {
    title: "电商业务概览",
    body: "集中查看关键指标、订单记录并完成常用业务操作。",
    create: "新建订单",
    filtersTitle: "筛选条件",
    filtersBody: "按状态、渠道和日期快速定位记录。",
    metricsTitle: "核心指标",
    tableTitle: "订单记录",
    tableBody: "查看近期订单状态与金额明细。",
    formTitle: "订单信息",
    formBody: "填写或修改当前订单的必要信息。",
    submit: "提交",
    cancel: "取消",
  } : {
    title: "Ecommerce Operations",
    body: "Review key metrics, inspect records, and complete common ecommerce tasks in one place.",
    create: "New order",
    filtersTitle: "Filters",
    filtersBody: "Narrow records by status, channel, and date.",
    metricsTitle: "Key metrics",
    tableTitle: "Order records",
    tableBody: "Inspect recent order status and value.",
    formTitle: "Order information",
    formBody: "Enter or update the information required for this order.",
    submit: "Submit",
    cancel: "Cancel",
  };
  return {
    elements: [
      leaf("page_title", "header_content", 0, "text", "Page Title", "Identify the operational workspace", copy.title, [{ key: "role", value: "heading" }]),
      leaf("page_description", "header_content", 1, "text", "Page Description", "Explain the workflow scope", copy.body),
      leaf("header_primary_action", "header_actions", 0, "button", "Create Order", "Start the primary ecommerce workflow", copy.create),
      leaf("filters_title", "filters_header", 0, "text", "Filters Title", "Label the filter controls", copy.filtersTitle, [{ key: "role", value: "subheading" }]),
      leaf("filters_description", "filters_header", 1, "text", "Filters Description", "Explain how filters narrow records", copy.filtersBody),
      leaf("record_filters", "filters_row", 0, "filter", "Record Filters", "Filter ecommerce records", chinese ? "选择筛选条件" : "Select filter values", [{ key: "fields", value: chinese ? ["状态", "渠道", "日期"] : ["Status", "Channel", "Date"] }]),
      leaf("metrics_title", "metrics_header", 0, "text", "Metrics Title", "Introduce the key business indicators", copy.metricsTitle, [{ key: "role", value: "subheading" }]),
      leaf("metric_orders", "metrics_grid", 0, "stat", chinese ? "今日订单" : "Orders Today", "Show today's order volume", "128"),
      leaf("metric_revenue", "metrics_grid", 1, "stat", chinese ? "成交金额" : "Revenue", "Show current revenue", "¥86,240"),
      leaf("metric_conversion", "metrics_grid", 2, "stat", chinese ? "转化率" : "Conversion", "Show current conversion rate", "4.8%"),
      leaf("table_title", "table_header", 0, "text", "Table Title", "Label the ecommerce records", copy.tableTitle, [{ key: "role", value: "subheading" }]),
      leaf("table_description", "table_header", 1, "text", "Table Description", "Explain the record set", copy.tableBody),
      leaf("orders_table", "table_content", 0, "table", "Orders Table", "Present ecommerce order records", undefined, [{ key: "columns", value: chinese ? ["订单号", "客户", "状态", "金额"] : ["Order", "Customer", "Status", "Amount"] }]),
      leaf("form_title", "form_header", 0, "text", "Form Title", "Label the edit form", copy.formTitle, [{ key: "role", value: "subheading" }]),
      leaf("form_description", "form_header", 1, "text", "Form Description", "Explain the form task", copy.formBody),
      leaf("order_form", "form_content", 0, "form", "Order Form", "Collect required order information", chinese ? "填写订单信息" : "Enter order information", [{ key: "fields", value: chinese ? ["客户", "商品", "数量", "备注"] : ["Customer", "Product", "Quantity", "Notes"] }]),
      leaf("submit_action", "action_row", 0, "button", "Submit Action", "Complete the current workflow", copy.submit),
      leaf("cancel_action", "action_row", 1, "button", "Cancel Action", "Leave the workflow without submitting", copy.cancel, [{ key: "type", value: "secondary" }]),
    ],
    notes: [`Deterministic mobile-first operational fallback for ${subject}.`],
  };
}

function generalFallbackElementPlan(
  state: Pick<DesignAgentState, "messages">,
  subject: string,
  parents: GeneralFallbackParents,
): ElementPlan {
  const chinese = state.messages.some((message) => /[\u3400-\u9fff]/u.test(message.content));
  const copy = chinese ? {
    heroTitle: `${subject}精选好物，帮你轻松做决定`,
    heroBody: "围绕中年买家的真实需求，集中呈现值得信赖的商品、价格信息和便捷购买入口。",
    heroAction: "立即选购",
    contentTitle: "本周推荐，实用与品质并重",
    contentBody: "从居家、健康到日常刚需，把更适合长期使用的商品放在最前面。",
    cards: [
      ["家庭常备精选", "优先展示口碑稳定、使用简单、售后清晰的热门商品。", "查看详情"],
      ["健康生活推荐", "围绕舒适、耐用和易操作体验整理更贴近日常的选择。", "加入购物车"],
      ["品质家居专场", "把高频使用场景下真正有价值的产品快速筛选出来。", "立即购买"],
    ],
    actionsTitle: "现在开始，更快找到适合你的商品",
    actionsBody: "继续浏览推荐内容，或直接进入购物车完成下单。",
    primaryAction: "去购物车",
    secondaryAction: "查看全部商品",
  } : {
    heroTitle: `Shop ${subject} with confidence`,
    heroBody: "Bring the most relevant offers, trusted product details, and clear purchase paths into one easy first view.",
    heroAction: "Shop now",
    contentTitle: "Featured picks for everyday value",
    contentBody: "Highlight dependable products, simple comparisons, and practical bundles that fit real routines.",
    cards: [
      ["Home essentials", "Surface dependable products that feel simple to compare and easy to trust.", "View details"],
      ["Healthy living picks", "Group durable, easy-to-use items that support comfort and long-term value.", "Add to cart"],
      ["Quality home upgrades", "Make higher-consideration products easier to evaluate in one glance.", "Buy now"],
    ],
    actionsTitle: "Ready to keep browsing or check out?",
    actionsBody: "Continue exploring the catalog or jump straight into the purchase flow.",
    primaryAction: "Go to cart",
    secondaryAction: "View all products",
  };

  const elements: ElementPlan["elements"] = [
    leaf("hero_title", parents.heroCopy, 0, "text", "Hero Title", "Introduce the page value", copy.heroTitle, [{ key: "role", value: "heading" }]),
    leaf("hero_body", parents.heroCopy, 1, "text", "Hero Description", "Explain the page value in one scan", copy.heroBody),
    leaf("hero_primary_action", parents.heroCopy, 2, "button", "Hero Primary Action", "Start the main browse or purchase flow", copy.heroAction),
    leaf("content_title", parents.contentHeading, 0, "text", "Content Heading", "Label the main content region", copy.contentTitle, [{ key: "role", value: "subheading" }]),
    leaf("content_body", parents.contentHeading, 1, "text", "Content Description", "Explain what is featured in the main content region", copy.contentBody),
    ...copy.cards.flatMap(([title, body, action], index) => [
      leaf(`content_card_${index + 1}_title`, parents.contentBody, index * 3, "text", `Content Card ${index + 1} Title`, "Name a featured recommendation", title, [{ key: "role", value: "subheading" }]),
      leaf(`content_card_${index + 1}_body`, parents.contentBody, index * 3 + 1, "text", `Content Card ${index + 1} Body`, "Explain the recommendation benefit", body),
      leaf(`content_card_${index + 1}_action`, parents.contentBody, index * 3 + 2, "button", `Content Card ${index + 1} Action`, "Open or purchase the recommendation", action, index === 1 ? [{ key: "type", value: "secondary" }] : []),
    ]),
    leaf("actions_title", parents.actionsHeading, 0, "text", "Actions Heading", "Close the page with clear next steps", copy.actionsTitle, [{ key: "role", value: "subheading" }]),
    leaf("actions_body", parents.actionsHeading, 1, "text", "Actions Description", "Reduce friction before the next action", copy.actionsBody),
    leaf("actions_primary", parents.actionsCta, 0, "button", "Primary CTA", "Advance the main checkout or browse flow", copy.primaryAction),
    leaf("actions_secondary", parents.actionsCta, 1, "button", "Secondary CTA", "Offer a lower-commitment next step", copy.secondaryAction, [{ key: "type", value: "secondary" }]),
  ];

  return {
    elements,
    notes: ["Deterministic general-page fallback fills the hero, content, and action groups with clear copy and calls to action."],
  };
}

function productFallbackElementPlan(
  state: Pick<DesignAgentState, "messages">,
  subject: string,
  parents: ProductFallbackParents,
): ElementPlan {
  const chinese = state.messages.some((message) => /[\u3400-\u9fff]/u.test(message.content));
  const copy = chinese ? {
    eyebrow: "新一代旗舰产品",
    title: `${subject}，重新定义日常体验`,
    body: "从性能、影像到续航，每一项能力都围绕真实使用场景重新打磨。",
    primary: "立即了解",
    secondary: "查看规格",
    proofTitle: "每一项提升，都有数据支撑",
    proofBody: "核心能力集中呈现，重要信息无需反复查找。",
    featuresTitle: "不止更快，而是全面进化",
    featuresBody: "三个关键能力共同构成更流畅、更可靠、更持久的产品体验。",
    featureTitles: ["旗舰性能", "专业影像", "全天续航"],
    featureBodies: ["高性能平台与智能调度协同工作，复杂任务依然从容。", "从明暗细节到色彩层次，随手记录也能保持稳定质感。", "更高效的能耗控制与快速补能，让节奏不被电量打断。"],
    storyEyebrow: "旗舰能力详解",
    storyTitle: "为真实场景而生的体验升级",
    storyBody: "硬件、软件与交互不再各自为战，而是围绕使用者形成完整而连贯的体验。",
    specsTitle: "关键规格，一目了然",
    specsBody: "把真正影响购买决策的信息集中放在这里。",
    socialTitle: "来自真实使用者的认可",
    socialBody: "稳定、顺手和可靠，是被反复提及的共同感受。",
    testimonials: ["从工作到娱乐切换非常顺畅，全天使用也没有负担。", "影像表现稳定，很多重要时刻不用再担心错过。"],
    ctaTitle: `准备好体验 ${subject} 了吗？`,
    ctaBody: "选择适合你的版本，开启新一代产品体验。",
    ctaPrimary: "立即购买",
    ctaSecondary: "咨询详情",
  } : {
    eyebrow: "A new generation flagship",
    title: `${subject}, reimagined for every day`,
    body: "Performance, imaging, and endurance work together as one complete product experience.",
    primary: "Explore now",
    secondary: "View specifications",
    proofTitle: "Meaningful gains, backed by evidence",
    proofBody: "The most important improvements are visible at a glance.",
    featuresTitle: "More than faster. Better in every way.",
    featuresBody: "Three core capabilities create a smoother, more reliable, and longer-lasting experience.",
    featureTitles: ["Flagship performance", "Pro imaging", "All-day endurance"],
    featureBodies: ["Advanced processing and intelligent scheduling keep demanding work responsive.", "Capture balanced detail, color, and light without slowing down the moment.", "Efficient power management and fast charging keep the day moving."],
    storyEyebrow: "Flagship capability",
    storyTitle: "Designed around real moments",
    storyBody: "Hardware, software, and interaction work together to make complex technology feel natural.",
    specsTitle: "The essentials, clearly compared",
    specsBody: "The details that matter most when choosing your configuration.",
    socialTitle: "Built for the way people actually use it",
    socialBody: "Speed, confidence, and reliability are the qualities users notice first.",
    testimonials: ["Moving between work and entertainment feels effortless all day.", "The camera is consistently dependable when the moment matters."],
    ctaTitle: `Ready to experience ${subject}?`,
    ctaBody: "Choose the configuration that fits your day and step into the next generation.",
    ctaPrimary: "Buy now",
    ctaSecondary: "Talk to an expert",
  };

  const elements: ElementPlan["elements"] = [
    leaf("hero_eyebrow", parents.heroCopy, 0, "badge", "Product Eyebrow", "Signal the product generation", copy.eyebrow),
    leaf("hero_title", parents.heroCopy, 1, "text", "Hero Title", "State the primary product promise", copy.title, [{ key: "role", value: "heading" }]),
    leaf("hero_body", parents.heroCopy, 2, "text", "Hero Description", "Explain the audience value", copy.body),
    leaf("hero_primary_action", parents.heroActions, 0, "button", "Primary Product Action", "Advance the main conversion path", copy.primary),
    leaf("hero_secondary_action", parents.heroActions, 1, "button", "Secondary Product Action", "Offer a lower commitment exploration path", copy.secondary, [{ key: "type", value: "secondary" }]),
    leaf("proof_title", parents.proofIntro, 0, "text", "Proof Title", "Introduce measurable product evidence", copy.proofTitle, [{ key: "role", value: "subheading" }]),
    leaf("proof_body", parents.proofIntro, 1, "text", "Proof Description", "Explain why the evidence matters", copy.proofBody),
    leaf("proof_performance", parents.proofMetrics, 0, "stat", "Performance", "Summarize the performance improvement", "2x"),
    leaf("proof_camera", parents.proofMetrics, 1, "stat", "Imaging Detail", "Summarize imaging capability", "48MP"),
    leaf("proof_battery", parents.proofMetrics, 2, "stat", "Battery Life", "Summarize daily endurance", "All day"),
    leaf("features_title", parents.featuresIntro, 0, "text", "Features Title", "Introduce the core capability set", copy.featuresTitle, [{ key: "role", value: "subheading" }]),
    leaf("features_body", parents.featuresIntro, 1, "text", "Features Description", "Connect the capabilities into one experience", copy.featuresBody),
    ...copy.featureTitles.flatMap((title, index) => [
      leaf(`feature_${index + 1}_title`, parents.featureCards[index] ?? parents.featuresIntro, 0, "text", `Feature ${index + 1} Title`, "Name a differentiated capability", title, [{ key: "role", value: "subheading" }]),
      leaf(`feature_${index + 1}_body`, parents.featureCards[index] ?? parents.featuresIntro, 1, "text", `Feature ${index + 1} Description`, "Explain the audience benefit", copy.featureBodies[index] ?? ""),
    ]),
    leaf("story_eyebrow", parents.storyCopy, 0, "badge", "Story Eyebrow", "Frame the flagship capability", copy.storyEyebrow),
    leaf("story_title", parents.storyCopy, 1, "text", "Story Title", "Lead the feature narrative", copy.storyTitle, [{ key: "role", value: "subheading" }]),
    leaf("story_body", parents.storyCopy, 2, "text", "Story Description", "Explain the integrated product experience", copy.storyBody),
    leaf("specs_title", parents.specificationsIntro, 0, "text", "Specifications Title", "Introduce key purchase facts", copy.specsTitle, [{ key: "role", value: "subheading" }]),
    leaf("specs_body", parents.specificationsIntro, 1, "text", "Specifications Description", "Explain the comparison value", copy.specsBody),
    ...["Display", "Processor", "Memory", "Storage", "Charging", "Starting price"].map((label, index) =>
      leaf(`spec_${index + 1}`, parents.specificationItems[index % parents.specificationItems.length] ?? parents.specificationsGrid, index, "stat", label, `Present the ${label.toLowerCase()} specification`, ["Pro display", "Flagship chip", "12 GB", "256 GB", "Fast charge", "Available now"][index]),
    ),
    leaf("social_title", parents.socialIntro, 0, "text", "Social Proof Title", "Introduce audience proof", copy.socialTitle, [{ key: "role", value: "subheading" }]),
    leaf("social_body", parents.socialIntro, 1, "text", "Social Proof Description", "Explain the relevance of audience proof", copy.socialBody),
    ...copy.testimonials.map((testimonial, index) => leaf(`testimonial_copy_${index + 1}`, parents.testimonialCards[index] ?? parents.socialGrid, index, "text", `Testimonial ${index + 1}`, "Provide concise audience-oriented proof", testimonial)),
    leaf("cta_title", parents.ctaCopy, 0, "text", "Final CTA Title", "Close the product narrative", copy.ctaTitle, [{ key: "role", value: "subheading" }]),
    leaf("cta_body", parents.ctaCopy, 1, "text", "Final CTA Description", "Reduce final decision friction", copy.ctaBody),
    leaf("cta_primary_action", parents.ctaActions, 0, "button", "Final Primary Action", "Complete the primary conversion", copy.ctaPrimary),
    leaf("cta_secondary_action", parents.ctaActions, 1, "button", "Final Secondary Action", "Offer an assisted conversion path", copy.ctaSecondary, [{ key: "type", value: "secondary" }]),
  ];
  return { elements, notes: ["Deterministic product narrative fallback with complete section coverage and no duplicate image elements."] };
}

export function resolveProductFallbackParents(document: DesignDocument): ProductFallbackParents {
  const containers = containerSummaries(document);
  const defaultParent = containers.find((container) => container.type === "stack")?.id
    ?? containers.find((container) => container.type === "section")?.id
    ?? containers[0]?.id
    ?? "root";
  const heroSection = pickKnownContainer(containers, ["hero_section", "sec-hero"], [/\bhero\b/], "section");
  const heroCopy = pickKnownContainer(containers, ["hero_copy", "stk-hero-copy"], [/hero[-_\s].*copy/, /\bhero copy\b/], "stack")
    ?? heroSection
    ?? defaultParent;
  const heroActions = pickKnownContainer(containers, ["hero_actions", "stk-hero-actions"], [/hero[-_\s].*actions?/, /\bhero actions?\b/], "stack")
    ?? heroCopy;
  const proofSection = pickKnownContainer(containers, ["proof_section", "sec-proof"], [/\bproof\b/, /\bevidence\b/], "section");
  const proofIntro = pickKnownContainer(containers, ["proof_intro", "stk-proof-content"], [/proof[-_\s].*(intro|content|heading)/, /\bproof content\b/, /\bproof heading\b/], "stack")
    ?? proofSection
    ?? heroCopy;
  const proofMetrics = pickKnownContainer(containers, ["proof_metrics", "stk-proof-metrics"], [/proof[-_\s].*metrics?/, /\bproof metrics\b/], "stack")
    ?? proofIntro;
  const featuresSection = pickKnownContainer(containers, ["features_section", "sec-features"], [/\bfeatures?\b/, /\bcapabilit(y|ies)\b/], "section");
  const featuresIntro = pickKnownContainer(containers, ["features_intro", "stk-features-intro"], [/features?[-_\s].*(intro|content|heading|body)/, /\bfeatures? intro\b/], "stack")
    ?? featuresSection
    ?? proofIntro;
  const featuresGrid = pickKnownContainer(containers, ["features_grid", "stk-features-grid"], [/features?[-_\s].*grid/, /\bfeature grid\b/], "stack")
    ?? featuresSection
    ?? featuresIntro;
  const featureCards = [
    pickKnownContainer(containers, ["feature_card_1", "stk-feature-card-1"], [/feature[-_\s].*card[-_\s]*1/, /\bfeature card (one|1)\b/], "stack"),
    pickKnownContainer(containers, ["feature_card_2", "stk-feature-card-2"], [/feature[-_\s].*card[-_\s]*2/, /\bfeature card (two|2)\b/], "stack"),
    pickKnownContainer(containers, ["feature_card_3", "stk-feature-card-3"], [/feature[-_\s].*card[-_\s]*3/, /\bfeature card (three|3)\b/], "stack"),
  ];
  const storySection = pickKnownContainer(containers, ["story_section", "sec-story", "sec-rules"], [/\bstory\b/, /\bnarrative\b/, /\bdetail\b/, /\brules?\b/], "section");
  const storyCopy = pickKnownContainer(containers, ["story_copy", "stk-story-copy", "stk-rules-content"], [/story[-_\s].*(copy|content)/, /rules[-_\s].*content/, /\bstory copy\b/, /\brules content\b/], "stack")
    ?? storySection
    ?? featuresIntro;
  const specificationsSection = pickKnownContainer(containers, ["specifications_section", "sec-specs"], [/\bspecs?\b/, /\bspecifications?\b/], "section");
  const specificationsIntro = pickKnownContainer(containers, ["specifications_intro", "stk-specs-content"], [/(specs?|specifications?)[-_\s].*(intro|content|heading)/], "stack")
    ?? specificationsSection
    ?? storyCopy;
  const specificationsGrid = pickKnownContainer(containers, ["specifications_grid", "stk-specs-list"], [/(specs?|specifications?)[-_\s].*(grid|list)/], "stack")
    ?? specificationsIntro;
  const specificationItems = [
    pickKnownContainer(containers, ["spec_item_1", "specification_item_1"], [/(spec|specification)[-_\s].*item[-_\s]*1/], "stack"),
    pickKnownContainer(containers, ["spec_item_2", "specification_item_2"], [/(spec|specification)[-_\s].*item[-_\s]*2/], "stack"),
    pickKnownContainer(containers, ["spec_item_3", "specification_item_3"], [/(spec|specification)[-_\s].*item[-_\s]*3/], "stack"),
  ];
  const socialSection = pickKnownContainer(containers, ["social_section", "sec-social"], [/\bsocial\b/, /\btestimonial/, /\breviews?\b/], "section");
  const socialIntro = pickKnownContainer(containers, ["social_intro", "stk-social-content"], [/social[-_\s].*(intro|content|heading)/], "stack")
    ?? socialSection
    ?? specificationsIntro;
  const socialGrid = pickKnownContainer(containers, ["social_grid", "stk-testimonials"], [/social[-_\s].*grid/, /\btestimonials?\b/, /\breviews?\b/], "stack")
    ?? socialIntro;
  const testimonialCards = [
    pickKnownContainer(containers, ["testimonial_1", "testimonial-card-1"], [/testimonial[-_\s]*1/, /review[-_\s]*1/], "stack"),
    pickKnownContainer(containers, ["testimonial_2", "testimonial-card-2"], [/testimonial[-_\s]*2/, /review[-_\s]*2/], "stack"),
    pickKnownContainer(containers, ["testimonial_3", "testimonial-card-3"], [/testimonial[-_\s]*3/, /review[-_\s]*3/], "stack"),
  ];
  const ctaSection = pickKnownContainer(containers, ["cta_section", "sec-cta"], [/\bcta\b/, /call to action/, /\bpurchase\b/], "section");
  const ctaCopy = pickKnownContainer(containers, ["cta_copy", "stk-cta-content"], [/cta[-_\s].*(copy|content|headline|body)/, /\bfinal cta\b/], "stack")
    ?? ctaSection
    ?? socialIntro;
  const ctaActions = pickKnownContainer(containers, ["cta_actions", "stk-cta-actions"], [/cta[-_\s].*actions?/, /final[-_\s].*actions?/], "stack")
    ?? ctaCopy;

  return {
    heroCopy,
    heroActions,
    proofIntro,
    proofMetrics,
    featuresIntro,
    featureCards: [
      featureCards[0] ?? featuresGrid,
      featureCards[1] ?? featuresGrid,
      featureCards[2] ?? featuresGrid,
    ],
    storyCopy,
    specificationsIntro,
    specificationsGrid,
    specificationItems: [
      specificationItems[0] ?? specificationsGrid,
      specificationItems[1] ?? specificationsGrid,
      specificationItems[2] ?? specificationsGrid,
    ],
    socialIntro,
    socialGrid,
    testimonialCards: [
      testimonialCards[0] ?? socialGrid,
      testimonialCards[1] ?? socialGrid,
      testimonialCards[2] ?? socialGrid,
    ],
    ctaCopy,
    ctaActions,
  };
}

export function resolveGeneralFallbackParents(document: DesignDocument): GeneralFallbackParents {
  const containers = containerSummaries(document);
  const defaultParent = containers.find((container) => container.type === "stack")?.id
    ?? containers.find((container) => container.type === "section")?.id
    ?? containers[0]?.id
    ?? "root";
  const heroCopy = pickKnownContainer(
    containers,
    ["hero_copy", "hero-copy", "stk-hero-copy", "hero-copy-group"],
    [/hero[-_\s].*copy/, /\bhero copy\b/, /文案组/],
    "stack",
  ) ?? defaultParent;
  const contentHeading = pickKnownContainer(
    containers,
    ["content_heading", "content-heading-group", "content_heading_group"],
    [/content[-_\s].*heading/, /heading[-_\s].*group/, /标题组/],
    "stack",
  ) ?? heroCopy;
  const contentBody = pickKnownContainer(
    containers,
    ["content_body", "content-body-grid", "content_body_grid", "product-grid"],
    [/content[-_\s].*(body|grid)/, /product[-_\s].*grid/, /\bgrid\b/, /商品.*网格/],
    "stack",
  ) ?? contentHeading;
  const actionsHeading = pickKnownContainer(
    containers,
    ["actions_heading", "actions-heading-group", "actions_heading_group"],
    [/actions?[-_\s].*heading/, /\bactions? heading\b/, /行动.*标题/],
    "stack",
  ) ?? contentHeading;
  const actionsCta = pickKnownContainer(
    containers,
    ["cta_actions", "actions-cta-group", "actions_cta_group", "action-buttons"],
    [/actions?[-_\s].*(cta|buttons?)/, /\bcta\b/, /action[-_\s].*buttons?/, /按钮组/],
    "stack",
  ) ?? actionsHeading;

  return {
    heroCopy,
    contentHeading,
    contentBody,
    actionsHeading,
    actionsCta,
  };
}

function pickKnownContainer(
  containers: ContainerSummary[],
  exactIds: string[],
  patterns: RegExp[],
  preferredType?: ContainerSummary["type"],
): string | undefined {
  for (const id of exactIds) {
    const exact = containers.find((container) => container.id === id);
    if (exact) return exact.id;
  }
  return pickContainer(containers, patterns, preferredType);
}

function pickContainer(
  containers: ContainerSummary[],
  patterns: RegExp[],
  preferredType?: ContainerSummary["type"],
): string | undefined {
  const matching = containers.filter((container) => matchesContainer(container, patterns));
  const preferred = preferredType
    ? matching.find((container) => container.type === preferredType)
    : undefined;
  return preferred?.id ?? matching[0]?.id;
}

function matchesContainer(container: ContainerSummary, patterns: RegExp[]) {
  const haystack = `${container.id} ${container.name}`.toLowerCase();
  return patterns.some((pattern) => pattern.test(haystack));
}

function leaf(
  id: string,
  parentId: string,
  order: number,
  type: ElementPlan["elements"][number]["type"],
  name: string,
  purpose: string,
  content: string | undefined,
  attributes: ElementPlan["elements"][number]["attributes"] = [],
): ElementPlan["elements"][number] {
  return { id, parentId, order, type, name, purpose, content, attributes };
}

async function readContentPlan(state: DesignAgentState, options: GraphNodeOptions): Promise<ContentPlan> {
  const ref = state.latestArtifactRefs.content_planning;
  if (!ref || !options.artifactStore) return buildContentPlan(state);
  const artifact = await options.artifactStore.readArtifact<{ contentPlan?: unknown }>(ref);
  return contentPlanSchema.parse(artifact.output.contentPlan);
}

function formatDiagnosticError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.length <= 4000) return message;
  return `${message.slice(0, 1900)}\n[error middle truncated]\n${message.slice(-1900)}`;
}

function summarizeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const parserErrorIndex = message.lastIndexOf("\nError:");
  const summary = parserErrorIndex >= 0 ? message.slice(parserErrorIndex + 1) : message;
  return summary.length <= 1200 ? summary : summary.slice(-1200);
}
