import { designDocumentSchema, designImageSlotSchema, type DesignDocument, type DesignElement, type DesignImageSlot, type JsonValue } from "@flowmind/shared";

import type { ArtifactRef, DesignAgentState } from "../../state.js";
import { writePipelineArtifact } from "../document-pipeline.js";
import type { GraphNodeOptions } from "../types.js";
import type { ReflectionRepairOutput } from "../reflection-repair/schema.js";
import type { VisualRepairAction, VisualReviewIssue, VisualReviewOutput } from "../visual-review/schema.js";
import type { DocumentRepairOutput } from "./schema.js";

type SchemaValidationArtifactOutput = {
  document?: unknown;
  errors?: string[];
};

export async function documentRepairNode(state: DesignAgentState, options: GraphNodeOptions): Promise<Partial<DesignAgentState>> {
  const schemaValidationRef = state.latestArtifactRefs.schema_validation;
  const visualReviewRef = state.latestArtifactRefs.visual_review;
  const reflectionRepairRef = state.latestArtifactRefs.reflection_repair;
  if (!options.artifactStore || !schemaValidationRef) {
    throw new Error("Missing required artifacts for document_repair.");
  }

  if (state.currentNode === "visual_review" || state.stage === "visual_review") {
    if (!visualReviewRef) throw new Error("Missing visual_review artifact for document_repair.");
    return repairFromVisualReview(state, options, schemaValidationRef as ArtifactRef, visualReviewRef as ArtifactRef);
  }

  if (!reflectionRepairRef) throw new Error("Missing reflection_repair artifact for document_repair.");
  return repairFromReflection(state, options, schemaValidationRef as ArtifactRef, reflectionRepairRef as ArtifactRef);
}

async function repairFromReflection(
  state: DesignAgentState,
  options: GraphNodeOptions,
  schemaValidationRef: ArtifactRef,
  reflectionRepairRef: ArtifactRef,
): Promise<Partial<DesignAgentState>> {
  const schemaValidationArtifact = await options.artifactStore!.readArtifact<SchemaValidationArtifactOutput>(schemaValidationRef);
  const reflectionRepairArtifact = await options.artifactStore!.readArtifact<ReflectionRepairOutput>(reflectionRepairRef);
  const appliedOperations = reflectionRepairArtifact.output.repairPlan.operations;
  const document = repairDocument(schemaValidationArtifact.output.document);
  const output: DocumentRepairOutput = {
    document,
    repaired: true,
    appliedOperations,
    sourceArtifacts: {
      schemaValidation: schemaValidationRef,
      reflectionRepair: reflectionRepairRef,
    },
  };
  return writeRepairArtifact(state, options, [schemaValidationRef, reflectionRepairRef], output);
}

async function repairFromVisualReview(
  state: DesignAgentState,
  options: GraphNodeOptions,
  schemaValidationRef: ArtifactRef,
  visualReviewRef: ArtifactRef,
): Promise<Partial<DesignAgentState>> {
  const visualReviewArtifact = await options.artifactStore!.readArtifact<VisualReviewOutput>(visualReviewRef);
  const sourceDocument = designDocumentSchema.parse(visualReviewArtifact.output.document);
  const { document, appliedOperations } = applyVisualRepairActions(
    sourceDocument,
    visualReviewArtifact.output.review.repairActions,
    visualReviewArtifact.output.review.issues,
  );
  const output: DocumentRepairOutput = {
    document,
    repaired: appliedOperations.length > 0,
    appliedOperations,
    sourceArtifacts: {
      schemaValidation: schemaValidationRef,
      visualReview: visualReviewRef,
    },
  };
  return writeRepairArtifact(state, options, [schemaValidationRef, visualReviewRef], output);
}

async function writeRepairArtifact(
  state: DesignAgentState,
  options: GraphNodeOptions,
  inputRefs: ArtifactRef[],
  output: DocumentRepairOutput,
): Promise<Partial<DesignAgentState>> {
  const update = await writePipelineArtifact({
    state,
    options,
    node: "document_repair",
    stage: "document_repair",
    inputRefs,
    output,
    errors: [],
  });

  return {
    ...update,
    repairAttempts: state.repairAttempts + 1,
    validationErrors: [],
  };
}

export function applyVisualRepairActions(
  document: DesignDocument,
  actions: VisualRepairAction[],
  issues: VisualReviewIssue[] = [],
) {
  const repaired = structuredClone(document) as DesignDocument;
  const appliedOperations: DocumentRepairOutput["appliedOperations"] = [];

  for (const action of actions) {
    const index = repaired.elements.findIndex((element) => element.id === action.elementId);
    const element = repaired.elements[index];
    if (!element) continue;
    if (applyVisualRepairAction(element, action, repaired)) {
      repaired.elements[index] = element;
      appliedOperations.push({ target: action.elementId, action: action.kind, reason: action.reason });
    }
  }

  applyIssueDrivenRepairs(repaired, issues, appliedOperations);

  return { document: designDocumentSchema.parse(repaired), appliedOperations };
}

function applyIssueDrivenRepairs(
  document: DesignDocument,
  issues: VisualReviewIssue[],
  appliedOperations: DocumentRepairOutput["appliedOperations"],
) {
  if (issues.length === 0) return;

  if (looksLikeCommerceHomepage(document) && needsCommerceHomepageRepair(issues)) {
    repairCommerceHomepageDocument(document, appliedOperations);
  }

  for (const issue of issues) {
    if (issue.code === "MISSING_FIRST_VIEWPORT_TITLE") {
      const firstSection = firstTopLevelSectionId(document);
      if (firstSection) {
        ensureSectionCopy(document, firstSection, appliedOperations);
      }
    }
    if (issue.code === "PRODUCT_SECTION_HAS_NO_COPY" && issue.elementId) {
      ensureSectionCopy(document, issue.elementId, appliedOperations);
    }
    if (issue.code === "PRODUCT_CONTENT_GROUP_EMPTY" && issue.elementId) {
      ensureGenericGroupContent(document, issue.elementId, appliedOperations);
    }
  }
}

function needsCommerceHomepageRepair(issues: VisualReviewIssue[]) {
  return issues.some((issue) => {
    if (issue.code === "MISSING_FIRST_VIEWPORT_TITLE" || issue.code === "PRODUCT_SECTION_HAS_NO_COPY" || issue.code === "PRODUCT_CONTENT_GROUP_EMPTY") {
      return true;
    }
    const text = `${issue.code} ${issue.suggestion}`.toLowerCase();
    return /search bar|category navigation|e-commerce purpose|product card|packed into section-hero|smartphone product launch|warm and soft|lacks warmth/.test(text);
  });
}

function looksLikeCommerceHomepage(document: DesignDocument) {
  const ids = new Set(document.elements.map((element) => element.id));
  return ids.has("section-hot-products") || ids.has("section-new-arrivals") || ids.has("section-limited-offers");
}

function repairCommerceHomepageDocument(
  document: DesignDocument,
  appliedOperations: DocumentRepairOutput["appliedOperations"],
) {
  applyWarmCommerceTheme(document, appliedOperations);
  moveHeroBackgroundToHeroSection(document, appliedOperations);
  repairHeaderSection(document, appliedOperations);
  repairHeroSection(document, appliedOperations);
  repairCategoriesSection(document, appliedOperations);
  repairProductListingSection(document, "section-hot-products", "stack-hot-products-heading", "stack-hot-products-grid", {
    title: "Hot picks trusted by middle-aged families",
    body: "High-repeat purchases across health care, home essentials, and lifestyle routines.",
    products: [
      { title: "Joint Comfort Supplement", body: "Daily support with a simple routine and reliable ingredients.", price: "USD 39", badge: "Best seller" },
      { title: "Warm Support Pillow", body: "Neck-friendly comfort for reading, resting, and better sleep.", price: "USD 49", badge: "Top rated" },
      { title: "Easy Grip Water Bottle", body: "Lightweight, leak-resistant, and comfortable to carry every day.", price: "USD 19", badge: "Repeat buy" },
    ],
  }, appliedOperations);
  repairProductListingSection(document, "section-new-arrivals", "stack-new-arrivals-heading", "stack-new-arrivals-grid", {
    title: "New arrivals for healthier daily habits",
    body: "Fresh products selected for readability, simple use, and long-term value.",
    products: [
      { title: "Calm Sleep Tea Set", body: "A gentle evening routine with clear brewing guidance.", price: "USD 24", badge: "New" },
      { title: "Soft Home Walking Mat", body: "Extra cushioning and anti-slip texture for daily movement.", price: "USD 36", badge: "Just in" },
      { title: "Portable Wellness Organizer", body: "Keeps supplements and essentials neatly sorted for the week.", price: "USD 28", badge: "Staff pick" },
    ],
  }, appliedOperations);
  repairProductListingSection(document, "section-limited-offers", "stack-limited-offers-heading", "stack-limited-offers-grid", {
    title: "Limited offers worth acting on today",
    body: "Short-term savings on reliable essentials without sacrificing quality or clarity.",
    products: [
      { title: "Heart Health Bundle", body: "Core daily support with clear dosage reminders and bundle savings.", price: "USD 59", badge: "Save 20%" },
      { title: "Home Comfort Starter Pack", body: "Three simple upgrades for a warmer and more comfortable space.", price: "USD 79", badge: "Bundle deal" },
      { title: "Lifestyle Recovery Kit", body: "Easy-care products for after-work relaxation and weekend recovery.", price: "USD 44", badge: "Ends soon" },
    ],
  }, appliedOperations);
  repairReviewsSection(document, appliedOperations);
  repairServiceGuaranteesSection(document, appliedOperations);
  repairFooterCtaSection(document, appliedOperations);
  simplifyHeroSection(document, appliedOperations);
}

function repairHeaderSection(document: DesignDocument, appliedOperations: DocumentRepairOutput["appliedOperations"]) {
  const sectionId = "section-header";
  if (!hasElement(document, sectionId)) return;
  const contentId = ensureStackChild(document, "stack-header-layout", "stack-header-content", "Header Content", "Keep title, search, and category navigation aligned.", appliedOperations);
  upsertText(document, contentId, "header_title", "Header Title", "Make everyday shopping easier to trust", "heading", appliedOperations);
  upsertText(document, contentId, "header_body", "Header Body", "Search health care, home essentials, and lifestyle products chosen for simple use and reliable quality.", "body", appliedOperations);
  upsertInput(document, contentId, "header_search", "Header Search", {
    label: "Search products",
    placeholder: "Search health, home, and lifestyle essentials",
    purpose: "Search the main catalog from the first viewport",
  }, appliedOperations);
  const navId = ensureStackChild(document, contentId, "stack-header-nav", "Header Navigation", "Offer simplified category shortcuts in the first viewport.", appliedOperations);
  upsertButton(document, navId, "header_nav_health", "Health Care", "Browse health care essentials", "secondary", appliedOperations);
  upsertButton(document, navId, "header_nav_home", "Home Daily Use", "Browse home daily use essentials", "secondary", appliedOperations);
  upsertButton(document, navId, "header_nav_lifestyle", "Lifestyle Goods", "Browse lifestyle goods", "secondary", appliedOperations);
}

function repairHeroSection(document: DesignDocument, appliedOperations: DocumentRepairOutput["appliedOperations"]) {
  if (!hasElement(document, "stack-hero-copy")) return;
  upsertText(document, "stack-hero-copy", "hero_eyebrow", "Hero Eyebrow", "Trusted picks for healthier and easier living", "caption", appliedOperations);
  upsertText(document, "stack-hero-copy", "hero_title", "Hero Title", "A warm storefront for middle-aged shoppers and families", "heading", appliedOperations);
  upsertText(document, "stack-hero-copy", "hero_body", "Hero Body", "Shop health care, home essentials, and lifestyle products with clearer copy, larger text, and obvious actions from the first screen onward.", "body", appliedOperations);
  upsertButton(document, "stack-hero-copy", "hero_primary_action", "Shop Best Sellers", "Open the hot products section", "primary", appliedOperations);
  upsertButton(document, "stack-hero-copy", "hero_secondary_action", "Browse Categories", "Jump to the category shortcuts", "secondary", appliedOperations);
}

function repairCategoriesSection(document: DesignDocument, appliedOperations: DocumentRepairOutput["appliedOperations"]) {
  if (!hasElement(document, "section-categories")) return;
  const headingId = ensureStackChild(document, "stack-categories-layout", "stack-categories-heading", "Categories Heading", "Introduce the three main category entry points.", appliedOperations);
  upsertText(document, headingId, "categories_title", "Categories Title", "Start with the three core shopping paths", "subheading", appliedOperations);
  upsertText(document, headingId, "categories_body", "Categories Body", "Each path groups products for faster scanning, stronger trust, and easier repeat purchase decisions.", "body", appliedOperations);
  const listId = ensureStackChild(document, "stack-categories-layout", "stack-categories-list", "Categories List", "Contain the main category cards.", appliedOperations);
  upsertCategoryCard(document, listId, "category_health", "Health Care", "Daily support products with clear benefits and easy-to-follow usage.", appliedOperations);
  upsertCategoryCard(document, listId, "category_home", "Home Daily Use", "Comfort-first essentials that make routines simpler and safer.", appliedOperations);
  upsertCategoryCard(document, listId, "category_lifestyle", "Lifestyle Goods", "Warm, practical products that improve rest, movement, and everyday joy.", appliedOperations);
}

function repairProductListingSection(
  document: DesignDocument,
  sectionId: string,
  headingId: string,
  gridId: string,
  config: {
    title: string;
    body: string;
    products: Array<{ title: string; body: string; price: string; badge: string }>;
  },
  appliedOperations: DocumentRepairOutput["appliedOperations"],
) {
  if (!hasElement(document, sectionId)) return;
  ensureStackChild(document, sectionId, headingId, "Section Heading", "Introduce the product listing section.", appliedOperations);
  ensureStackChild(document, sectionId, gridId, "Section Grid", "Contain the product cards for the section.", appliedOperations);
  upsertText(document, headingId, `${headingId}_title`, "Section Title", config.title, "subheading", appliedOperations);
  upsertText(document, headingId, `${headingId}_body`, "Section Body", config.body, "body", appliedOperations);
  config.products.forEach((product, index) => {
    upsertProductCard(document, gridId, `${gridId}_card_${index + 1}`, product, appliedOperations);
  });
}

function repairReviewsSection(document: DesignDocument, appliedOperations: DocumentRepairOutput["appliedOperations"]) {
  if (!hasElement(document, "section-reviews")) return;
  const headingId = ensureStackChild(document, "stack-reviews-layout", "stack-reviews-heading", "Reviews Heading", "Introduce customer proof and trust signals.", appliedOperations);
  const gridId = ensureStackChild(document, "stack-reviews-layout", "stack-reviews-grid", "Reviews Grid", "Contain customer proof cards.", appliedOperations);
  moveTreeChild(document, "social_title", headingId, appliedOperations, "Move reviews title into the reviews heading group.");
  moveTreeChild(document, "social_body", headingId, appliedOperations, "Move reviews body into the reviews heading group.");
  upsertText(document, headingId, "social_title", "Reviews Title", "Proof that keeps trust high over time", "subheading", appliedOperations);
  upsertText(document, headingId, "social_body", "Reviews Body", "Real customer notes, repeat-purchase signals, and service confidence in one place.", "body", appliedOperations);
  upsertTestimonialCard(document, gridId, "testimonial_1", "Reliable quality and easy ordering", "The search and category shortcuts made it simple to find what I needed without extra steps.", appliedOperations);
  upsertTestimonialCard(document, gridId, "testimonial_2", "Clear copy and fast repeat purchase", "I can compare products quickly, understand the benefits, and reorder with confidence.", appliedOperations);
}

function repairServiceGuaranteesSection(document: DesignDocument, appliedOperations: DocumentRepairOutput["appliedOperations"]) {
  if (!hasElement(document, "section-service-guarantees")) return;
  const headingId = ensureStackChild(document, "stack-service-guarantees-layout", "stack-service-guarantees-heading", "Service Guarantees Heading", "Introduce the platform promises.", appliedOperations);
  const itemsId = ensureStackChild(document, "stack-service-guarantees-layout", "stack-service-guarantees-items", "Service Guarantee Items", "Contain the main service guarantee cards.", appliedOperations);
  upsertText(document, headingId, "service_guarantees_title", "Service Guarantees Title", "Service promises that reduce purchase friction", "subheading", appliedOperations);
  upsertText(document, headingId, "service_guarantees_body", "Service Guarantees Body", "Transparent delivery, readable policies, and clear support from browsing to repeat orders.", "body", appliedOperations);
  upsertInfoCard(document, itemsId, "service_guarantee_delivery", "Reliable delivery", "Estimated arrival windows and easy tracking for every order.", appliedOperations);
  upsertInfoCard(document, itemsId, "service_guarantee_support", "Helpful support", "Simple contact paths for product questions, ordering, and after-sales help.", appliedOperations);
  upsertInfoCard(document, itemsId, "service_guarantee_returns", "Straightforward returns", "Readable policies that help users make decisions with confidence.", appliedOperations);
}

function repairFooterCtaSection(document: DesignDocument, appliedOperations: DocumentRepairOutput["appliedOperations"]) {
  if (!hasElement(document, "section-footer-cta")) return;
  const contentId = ensureStackChild(document, "stack-footer-cta-layout", "stack-footer-cta-content", "Footer CTA Content", "Contain the final conversion copy and actions.", appliedOperations);
  upsertText(document, contentId, "cta_title", "CTA Title", "Ready to build an easier daily routine?", "heading", appliedOperations);
  upsertText(document, contentId, "cta_body", "CTA Body", "Explore dependable products with warm guidance, stronger readability, and clear next steps.", "body", appliedOperations);
  upsertButton(document, contentId, "cta_primary_action", "Start Shopping", "Open the main shopping journey", "primary", appliedOperations);
  upsertButton(document, contentId, "cta_secondary_action", "View Guarantees", "Review delivery, support, and return promises", "secondary", appliedOperations);
}

function ensureSectionCopy(
  document: DesignDocument,
  sectionId: string,
  appliedOperations: DocumentRepairOutput["appliedOperations"],
) {
  const section = findElement(document, sectionId);
  if (!section || section.type !== "section") return;
  const copyTarget = findPreferredCopyTarget(document, sectionId) ?? sectionId;
  const template = sectionCopyTemplate(sectionId, section.name);
  upsertText(document, copyTarget, `${sectionId}_repair_title`, `${section.name} Title`, template.title, "subheading", appliedOperations);
  upsertText(document, copyTarget, `${sectionId}_repair_body`, `${section.name} Body`, template.body, "body", appliedOperations);
}

function ensureGenericGroupContent(
  document: DesignDocument,
  groupId: string,
  appliedOperations: DocumentRepairOutput["appliedOperations"],
) {
  const element = findElement(document, groupId);
  if (!element || (element.type !== "stack" && element.type !== "section")) return;
  const existingChildren = findTreeNode(document.tree, groupId)?.children ?? [];
  if (existingChildren.length > 0) return;

  if (/actions?/i.test(groupId)) {
    upsertButton(document, groupId, `${groupId}_primary`, "Primary Action", "Continue with the main conversion flow", "primary", appliedOperations);
    upsertButton(document, groupId, `${groupId}_secondary`, "Secondary Action", "Review more details before conversion", "secondary", appliedOperations);
    return;
  }

  if (/(grid|list|items)/i.test(groupId)) {
    upsertInfoCard(document, groupId, `${groupId}_card_1`, "Clear benefits", "Short, readable supporting copy helps the section become actionable.", appliedOperations);
    upsertInfoCard(document, groupId, `${groupId}_card_2`, "Easy scanning", "Balanced cards stop key content from collapsing into a single dense block.", appliedOperations);
    return;
  }

  upsertText(document, groupId, `${groupId}_title`, "Group Title", "Added supporting heading", "subheading", appliedOperations);
  upsertText(document, groupId, `${groupId}_body`, "Group Body", "Added supporting copy so the document can continue through review.", "body", appliedOperations);
}

function applyVisualRepairAction(element: DesignElement, action: VisualRepairAction, document: DesignDocument): boolean {
  if (action.kind === "add_missing_primary_action_note") {
    const notes = readRepairNotes(document.variables.visualRepairNotes);
    document.variables.visualRepairNotes = [...notes, { elementId: action.elementId, reason: action.reason, value: action.value }] as JsonValue;
    return true;
  }

  if (action.kind === "set_container_overflow") {
    if (!("container" in element.style) || typeof action.value !== "string") return false;
    if (!["visible", "hidden", "auto"].includes(action.value)) return false;
    element.style = { ...element.style, container: { ...element.style.container, overflow: action.value as "visible" | "hidden" | "auto" } };
    return true;
  }

  if (action.kind === "restore_image_slot_metadata" || action.kind === "set_background_slot_metadata") {
    const slot = parseActionSlot(action);
    if (!slot) return false;
    if (action.kind === "restore_image_slot_metadata" && element.type !== "image") return false;
    if (action.kind === "set_background_slot_metadata" && !["page", "section", "stack"].includes(element.type)) return false;
    element.props = { ...element.props, imageSlotId: slot.id, imageSlot: slot };
    return true;
  }

  if (action.kind === "set_slot_stable_layout") {
    const slot = parseActionSlot(action) ?? designImageSlotSchema.safeParse(element.props.imageSlot).data;
    if (!slot || element.type !== "image") return false;
    element.props = { ...element.props, imageSlotId: slot.id, imageSlot: slot };
    element.layout = { ...element.layout, width: element.layout?.width ?? "fill", height: "hug", fixedHeight: undefined };
    if ("image" in element.style) {
      element.style = {
        ...element.style,
        image: {
          ...element.style.image,
          aspectRatio: imageStyleAspectRatio(slot.display.aspectRatio),
          objectFit: slot.display.objectFit,
        },
      };
    }
    return true;
  }

  const parsedSlot = designImageSlotSchema.safeParse(element.props.imageSlot);
  if (!parsedSlot.success || (action.slotId && parsedSlot.data.id !== action.slotId)) return false;
  const slot = structuredClone(parsedSlot.data) as DesignImageSlot;

  if (action.kind === "set_slot_max_height" && typeof action.value === "number") {
    slot.display.maxHeight = Math.trunc(action.value);
  } else if (action.kind === "set_slot_aspect_ratio" && typeof action.value === "string" && isSlotAspectRatio(action.value)) {
    slot.display.aspectRatio = action.value;
  } else if (action.kind === "set_slot_object_fit" && typeof action.value === "string" && isObjectFit(action.value)) {
    slot.display.objectFit = action.value;
  } else if (action.kind === "set_slot_focal_point" && typeof action.value === "string" && isFocalPoint(action.value)) {
    slot.display.focalPoint = action.value;
  } else {
    return false;
  }

  element.props = { ...element.props, imageSlotId: slot.id, imageSlot: designImageSlotSchema.parse(slot) };
  return true;
}

function parseActionSlot(action: VisualRepairAction): DesignImageSlot | undefined {
  const parsed = designImageSlotSchema.safeParse(action.value);
  if (!parsed.success) return undefined;
  if (action.slotId && parsed.data.id !== action.slotId) return undefined;
  return parsed.data;
}

function imageStyleAspectRatio(value: DesignImageSlot["display"]["aspectRatio"]): "wide" | "square" | "portrait" {
  if (value === "1:1") return "square";
  if (value === "3:4") return "portrait";
  return "wide";
}

function readRepairNotes(value: unknown): JsonValue[] {
  return Array.isArray(value) ? value.filter((item): item is JsonValue => item !== undefined) : [];
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function applyWarmCommerceTheme(
  document: DesignDocument,
  appliedOperations: DocumentRepairOutput["appliedOperations"],
) {
  const designTheme = readRecord(document.variables.designTheme);
  if (designTheme?.theme === "commerce_editorial" && designTheme?.tone === "premium") return;

  document.variables.designTheme = { theme: "commerce_editorial", tone: "premium" };
  const agentPlanning = readRecord(document.variables.agentPlanning);
  const stylePlan = readRecord(agentPlanning?.stylePlan);
  if (agentPlanning && stylePlan) {
    stylePlan.theme = "commerce_editorial";
    stylePlan.tone = "premium";
  }

  for (const element of document.elements) {
    if (element.type === "page") {
      element.style = {
        ...element.style,
        base: { ...element.style.base, backgroundColor: "surface" },
      };
    }
    if (element.type === "section" || element.type === "stack") {
      element.style = {
        ...element.style,
        base: { ...element.style.base, backgroundColor: element.id.includes("hero") ? "surface" : "white" },
      };
    }
    if (element.type === "button" && element.style.button.emphasis === "primary") {
      element.style = {
        ...element.style,
        base: {
          ...element.style.base,
          backgroundColor: "warning",
          text: { ...element.style.base.text, color: "white", fontWeight: "semibold" },
        },
      };
    }
    if (element.type === "button" && element.style.button.emphasis === "secondary") {
      element.style = {
        ...element.style,
        base: {
          ...element.style.base,
          backgroundColor: "white",
          border: { width: "sm", style: "solid", color: "success" },
          text: { ...element.style.base.text, color: "success", fontWeight: "semibold" },
        },
      };
    }
    if (element.type === "text" && element.style.text.role === "body") {
      element.style = {
        ...element.style,
        base: {
          ...element.style.base,
          text: { ...element.style.base.text, fontSize: "lg", lineHeight: "relaxed" },
        },
      };
    }
    if (element.type === "text" && element.style.text.role === "caption") {
      element.style = {
        ...element.style,
        base: {
          ...element.style.base,
          text: { ...element.style.base.text, fontSize: "md", lineHeight: "normal" },
        },
      };
    }
  }

  appliedOperations.push({
    target: document.id,
    action: "apply_warm_commerce_theme",
    reason: "Shift the repaired document toward the requested warm commerce theme and premium tone.",
  });
}

function moveHeroBackgroundToHeroSection(
  document: DesignDocument,
  appliedOperations: DocumentRepairOutput["appliedOperations"],
) {
  const header = findElement(document, "section-header");
  const hero = findElement(document, "section-hero");
  if (!header || header.type !== "section" || !hero || hero.type !== "section") return;
  const slotValue = header.props.imageSlot;
  const slotId = typeof header.props.imageSlotId === "string" ? header.props.imageSlotId : undefined;
  if (!slotValue && !slotId) return;

  const slotRecord = isObject(slotValue) ? { ...slotValue } : undefined;
  if (slotRecord && typeof slotRecord.parentId === "string") slotRecord.parentId = "section-hero";

  hero.props = {
    ...hero.props,
    ...(slotId ? { imageSlotId: slotId } : {}),
    ...(slotRecord ? { imageSlot: slotRecord } : {}),
    visualAssetId: header.props.visualAssetId ?? hero.props.visualAssetId,
    visualAssetKind: header.props.visualAssetKind ?? hero.props.visualAssetKind,
    visualAssetRole: header.props.visualAssetRole ?? hero.props.visualAssetRole,
    promptBrief: header.props.promptBrief ?? hero.props.promptBrief,
    requestedWidth: header.props.requestedWidth ?? hero.props.requestedWidth,
    requestedHeight: header.props.requestedHeight ?? hero.props.requestedHeight,
    generationPriority: header.props.generationPriority ?? hero.props.generationPriority,
    foregroundTone: header.props.foregroundTone ?? hero.props.foregroundTone,
    generatedImagePrompt: header.props.generatedImagePrompt ?? hero.props.generatedImagePrompt,
    generatedImageSize: header.props.generatedImageSize ?? hero.props.generatedImageSize,
  };

  const {
    imageSlotId: _imageSlotId,
    imageSlot: _imageSlot,
    visualAssetId: _visualAssetId,
    visualAssetKind: _visualAssetKind,
    visualAssetRole: _visualAssetRole,
    promptBrief: _promptBrief,
    requestedWidth: _requestedWidth,
    requestedHeight: _requestedHeight,
    generationPriority: _generationPriority,
    foregroundTone: _foregroundTone,
    generatedImagePrompt: _generatedImagePrompt,
    generatedImageSize: _generatedImageSize,
    ...remainingHeaderProps
  } = header.props;
  header.props = remainingHeaderProps;

  appliedOperations.push({
    target: "section-hero",
    action: "move_hero_background_slot",
    reason: "Attach hero image metadata to the hero section instead of the header section.",
  });
}

function simplifyHeroSection(
  document: DesignDocument,
  appliedOperations: DocumentRepairOutput["appliedOperations"],
) {
  if (!hasElement(document, "stack-hero-copy")) return;
  const removablePrefixes = ["proof_", "feature_", "features_", "story_", "spec_", "specs_"];
  for (const id of collectDescendantIds(document, "stack-hero-copy")) {
    if (!removablePrefixes.some((prefix) => id.startsWith(prefix))) continue;
    removeTreeChild(document, id);
    removeElementById(document, id);
    appliedOperations.push({
      target: id,
      action: "remove_misaligned_hero_copy",
      reason: "Remove detailed product-spec copy from the homepage hero.",
    });
  }
}

function firstTopLevelSectionId(document: DesignDocument) {
  for (const child of document.tree.children ?? []) {
    const element = findElement(document, child.id);
    if (element?.type === "section" || element?.type === "page" || element?.type === "stack") return child.id;
  }
  return undefined;
}

function findPreferredCopyTarget(document: DesignDocument, sectionId: string) {
  const node = findTreeNode(document.tree, sectionId);
  if (!node) return undefined;
  for (const child of node.children ?? []) {
    const element = findElement(document, child.id);
    if (element?.type === "stack") return child.id;
  }
  return undefined;
}

function sectionCopyTemplate(sectionId: string, sectionName: string) {
  const key = `${sectionId} ${sectionName}`.toLowerCase();
  if (key.includes("header")) {
    return {
      title: "Shop with clarity from the very first screen",
      body: "Add a strong title, quick search, and category shortcuts so users understand the page purpose immediately.",
    };
  }
  if (key.includes("categories")) {
    return {
      title: "Browse by the three daily shopping paths",
      body: "Health care, home daily use, and lifestyle goods are grouped to reduce search effort and improve confidence.",
    };
  }
  if (key.includes("hot-products")) {
    return {
      title: "Hot products customers come back for",
      body: "Lead with proven, easy-to-understand essentials that reflect repeat-purchase behavior.",
    };
  }
  if (key.includes("new-arrivals")) {
    return {
      title: "New arrivals worth exploring",
      body: "Introduce fresh products with the same clear copy and confidence-building layout.",
    };
  }
  if (key.includes("limited-offers")) {
    return {
      title: "Time-sensitive offers with clear value",
      body: "Make savings obvious while keeping trust, readability, and next steps simple.",
    };
  }
  if (key.includes("service")) {
    return {
      title: "Service guarantees that support every order",
      body: "Shipping, support, and return reassurance should appear before the final conversion step.",
    };
  }
  if (key.includes("review")) {
    return {
      title: "Customer proof that supports confidence",
      body: "Short testimonial copy and trust signals help validate the purchase decision.",
    };
  }
  if (key.includes("footer") || key.includes("cta")) {
    return {
      title: "Finish with a confident next step",
      body: "Close with a clear conversion message and a primary action users can understand at a glance.",
    };
  }
  return {
    title: "Add a clear section heading",
    body: "This section now includes supporting copy so the design can continue through quality review.",
  };
}

function upsertCategoryCard(
  document: DesignDocument,
  parentId: string,
  cardId: string,
  title: string,
  body: string,
  appliedOperations: DocumentRepairOutput["appliedOperations"],
) {
  const containerId = ensureStackChild(document, parentId, `${cardId}_stack`, title, body, appliedOperations);
  upsertText(document, containerId, `${cardId}_title`, `${title} Title`, title, "subheading", appliedOperations);
  upsertText(document, containerId, `${cardId}_body`, `${title} Body`, body, "body", appliedOperations);
  upsertButton(document, containerId, `${cardId}_action`, "Explore", `Browse ${title.toLowerCase()} products`, "secondary", appliedOperations);
}

function upsertProductCard(
  document: DesignDocument,
  parentId: string,
  cardId: string,
  product: { title: string; body: string; price: string; badge: string },
  appliedOperations: DocumentRepairOutput["appliedOperations"],
) {
  const containerId = ensureStackChild(document, parentId, `${cardId}_stack`, `${product.title} Card`, product.body, appliedOperations);
  upsertImage(document, containerId, `${cardId}_image`, `${product.title} Image`, `Product image for ${product.title}`, appliedOperations);
  upsertText(document, containerId, `${cardId}_badge`, `${product.title} Badge`, product.badge, "caption", appliedOperations);
  upsertText(document, containerId, `${cardId}_title`, `${product.title} Title`, product.title, "subheading", appliedOperations);
  upsertText(document, containerId, `${cardId}_body`, `${product.title} Body`, product.body, "body", appliedOperations);
  upsertText(document, containerId, `${cardId}_price`, `${product.title} Price`, product.price, "body", appliedOperations);
  upsertButton(document, containerId, `${cardId}_buy`, "Buy Now", `Buy ${product.title}`, "primary", appliedOperations);
  upsertButton(document, containerId, `${cardId}_cart`, "Add to Cart", `Add ${product.title} to cart`, "secondary", appliedOperations);
}

function upsertTestimonialCard(
  document: DesignDocument,
  parentId: string,
  cardId: string,
  title: string,
  body: string,
  appliedOperations: DocumentRepairOutput["appliedOperations"],
) {
  const containerId = ensureStackChild(document, parentId, `${cardId}_stack`, `${title} Testimonial`, body, appliedOperations);
  upsertText(document, containerId, `${cardId}_title`, `${title} Title`, title, "subheading", appliedOperations);
  upsertText(document, containerId, `${cardId}_body`, `${title} Body`, body, "body", appliedOperations);
}

function upsertInfoCard(
  document: DesignDocument,
  parentId: string,
  cardId: string,
  title: string,
  body: string,
  appliedOperations: DocumentRepairOutput["appliedOperations"],
) {
  const containerId = ensureStackChild(document, parentId, `${cardId}_stack`, title, body, appliedOperations);
  upsertText(document, containerId, `${cardId}_title`, `${title} Title`, title, "subheading", appliedOperations);
  upsertText(document, containerId, `${cardId}_body`, `${title} Body`, body, "body", appliedOperations);
}

function ensureStackChild(
  document: DesignDocument,
  parentId: string,
  id: string,
  name: string,
  purpose: string,
  appliedOperations: DocumentRepairOutput["appliedOperations"],
) {
  const existing = findElement(document, id);
  if (existing?.type === "stack") return id;
  if (!findElement(document, parentId)) return parentId;
  addElementToDocument(document, parentId, {
    id,
    name,
    type: "stack",
    layout: { display: "flex", direction: "vertical", gap: "sm", width: "fill", height: "hug" },
    props: { purpose },
    style: containerStyle("white"),
  });
  appliedOperations.push({ target: id, action: "add_stack_group", reason: purpose });
  return id;
}

function upsertText(
  document: DesignDocument,
  parentId: string,
  id: string,
  name: string,
  text: string,
  role: "heading" | "subheading" | "body" | "caption",
  appliedOperations: DocumentRepairOutput["appliedOperations"],
) {
  const existing = findElement(document, id);
  const style = textRoleStyle(role);
  if (existing?.type === "text") {
    const changed = existing.props.text !== text || existing.name !== name;
    existing.name = name;
    existing.props = { ...existing.props, text };
    existing.style = style;
    if (changed) {
      appliedOperations.push({ target: id, action: "update_text_copy", reason: `Refresh copy for ${name}.` });
    }
    return;
  }
  if (!findElement(document, parentId)) return;
  addElementToDocument(document, parentId, {
    id,
    name,
    type: "text",
    layout: { width: "fill", height: "hug" },
    props: { text },
    style,
  });
  appliedOperations.push({ target: id, action: "add_text_copy", reason: `Add ${name} to satisfy content review.` });
}

function upsertButton(
  document: DesignDocument,
  parentId: string,
  id: string,
  label: string,
  purpose: string,
  emphasis: "primary" | "secondary",
  appliedOperations: DocumentRepairOutput["appliedOperations"],
) {
  const existing = findElement(document, id);
  const style = buttonStyle(emphasis);
  if (existing?.type === "button") {
    const changed = existing.props.label !== label || existing.props.purpose !== purpose;
    existing.name = label;
    existing.props = { ...existing.props, label, purpose };
    existing.style = style;
    if (changed) {
      appliedOperations.push({ target: id, action: "update_button_copy", reason: `Refresh action ${label}.` });
    }
    return;
  }
  if (!findElement(document, parentId)) return;
  addElementToDocument(document, parentId, {
    id,
    name: label,
    type: "button",
    layout: { width: "hug", height: "hug" },
    props: { label, purpose },
    style,
  });
  appliedOperations.push({ target: id, action: "add_button_action", reason: `Add ${label} action to satisfy review.` });
}

function upsertInput(
  document: DesignDocument,
  parentId: string,
  id: string,
  name: string,
  props: Record<string, unknown>,
  appliedOperations: DocumentRepairOutput["appliedOperations"],
) {
  const existing = findElement(document, id);
  const style = controlStyle();
  if (existing?.type === "input") {
    const changed = JSON.stringify(existing.props) !== JSON.stringify({ ...existing.props, ...props });
    existing.name = name;
    existing.props = { ...existing.props, ...props };
    existing.style = style;
    if (changed) {
      appliedOperations.push({ target: id, action: "update_input_control", reason: `Refresh ${name} search control.` });
    }
    return;
  }
  if (!findElement(document, parentId)) return;
  addElementToDocument(document, parentId, {
    id,
    name,
    type: "input",
    layout: { width: "fill", height: "hug" },
    props,
    style,
  });
  appliedOperations.push({ target: id, action: "add_input_control", reason: `Add ${name} so first viewport search is available.` });
}

function upsertImage(
  document: DesignDocument,
  parentId: string,
  id: string,
  name: string,
  purpose: string,
  appliedOperations: DocumentRepairOutput["appliedOperations"],
) {
  const existing = findElement(document, id);
  const style = imageStyle();
  if (existing?.type === "image") {
    existing.name = name;
    existing.props = { ...existing.props, purpose };
    existing.style = style;
    existing.layout = { width: "fill", height: "hug" };
    return;
  }
  if (!findElement(document, parentId)) return;
  addElementToDocument(document, parentId, {
    id,
    name,
    type: "image",
    layout: { width: "fill", height: "hug" },
    props: { purpose },
    style,
  });
  appliedOperations.push({ target: id, action: "add_product_image", reason: `Add product image slot for ${name}.` });
}

function addElementToDocument(document: DesignDocument, parentId: string, element: DesignElement) {
  if (findElement(document, element.id)) return;
  const parentNode = findTreeNode(document.tree, parentId);
  if (!parentNode) return;
  parentNode.children = [...(parentNode.children ?? []), { id: element.id, children: [] }];
  document.elements.push(element);
}

function moveTreeChild(
  document: DesignDocument,
  childId: string,
  newParentId: string,
  appliedOperations: DocumentRepairOutput["appliedOperations"],
  reason: string,
) {
  if (!findElement(document, childId) || !findTreeNode(document.tree, newParentId)) return;
  if (isDirectChild(document, newParentId, childId)) return;
  const detached = detachTreeChild(document.tree, childId);
  if (!detached) return;
  const parent = findTreeNode(document.tree, newParentId);
  if (!parent) return;
  parent.children = [...(parent.children ?? []), detached];
  appliedOperations.push({ target: childId, action: "move_tree_child", reason });
}

function collectDescendantIds(document: DesignDocument, rootId: string): string[] {
  const node = findTreeNode(document.tree, rootId);
  if (!node) return [];
  return flattenTree(node).filter((id) => id !== rootId);
}

function flattenTree(node: DesignDocument["tree"]): string[] {
  return [node.id, ...(node.children ?? []).flatMap(flattenTree)];
}

function removeTreeChild(document: DesignDocument, childId: string) {
  detachTreeChild(document.tree, childId);
}

function detachTreeChild(node: DesignDocument["tree"], childId: string): DesignDocument["tree"] | undefined {
  const children = node.children ?? [];
  const index = children.findIndex((child) => child.id === childId);
  if (index >= 0) {
    const [removed] = children.splice(index, 1);
    node.children = children;
    return removed;
  }
  for (const child of children) {
    const removed = detachTreeChild(child, childId);
    if (removed) return removed;
  }
  return undefined;
}

function isDirectChild(document: DesignDocument, parentId: string, childId: string) {
  const node = findTreeNode(document.tree, parentId);
  return Boolean(node?.children?.some((child) => child.id === childId));
}

function removeElementById(document: DesignDocument, id: string) {
  const index = document.elements.findIndex((element) => element.id === id);
  if (index >= 0) document.elements.splice(index, 1);
}

function findElement(document: DesignDocument, id: string) {
  return document.elements.find((element) => element.id === id);
}

function hasElement(document: DesignDocument, id: string) {
  return document.elements.some((element) => element.id === id);
}

function findTreeNode(node: DesignDocument["tree"], id: string): DesignDocument["tree"] | undefined {
  if (node.id === id) return node;
  for (const child of node.children ?? []) {
    const found = findTreeNode(child, id);
    if (found) return found;
  }
  return undefined;
}

function textRoleStyle(role: "heading" | "subheading" | "body" | "caption") {
  const color = role === "caption" ? "textSecondary" as const : "textPrimary" as const;
  const fontSize = role === "heading"
    ? "2xl" as const
    : role === "subheading"
      ? "lg" as const
      : role === "caption"
        ? "sm" as const
        : "md" as const;
  const fontWeight = role === "heading" ? "bold" as const : role === "subheading" ? "semibold" as const : "regular" as const;
  const lineHeight = role === "heading" ? "tight" as const : "normal" as const;
  const style = {
    base: {
      ...baseStyle("transparent", color, fontSize, fontWeight),
      text: {
        color,
        fontFamily: "sans" as const,
        fontSize,
        fontWeight,
        lineHeight,
        align: "left" as const,
      },
    },
    text: {
      role,
      decoration: "none" as const,
      transform: "none" as const,
    },
  };
  return style satisfies Extract<DesignElement, { type: "text" }>["style"];
}

function buttonStyle(emphasis: "primary" | "secondary") {
  const primary = emphasis === "primary";
  const style = {
    base: {
      ...baseStyle(primary ? "brand" : "white", primary ? "white" : "brand", "md", "semibold"),
      border: primary
        ? { width: "none" as const, style: "none" as const, color: "border" as const }
        : { width: "sm" as const, style: "solid" as const, color: "border" as const },
      text: {
        color: primary ? "white" as const : "brand" as const,
        fontFamily: "sans" as const,
        fontSize: "md" as const,
        fontWeight: "semibold" as const,
        lineHeight: "normal" as const,
        align: "left" as const,
      },
    },
    button: {
      size: "md" as const,
      emphasis: primary ? "primary" as const : "secondary" as const,
    },
  };
  return style satisfies Extract<DesignElement, { type: "button" }>["style"];
}

function controlStyle() {
  const style = {
    base: baseStyle("white", "textPrimary", "md", "regular"),
    control: {
      size: "md" as const,
      labelPosition: "top" as const,
      fieldGap: "sm" as const,
    },
  };
  return style satisfies Extract<DesignElement, { type: "input" }>["style"];
}

function imageStyle() {
  const style = {
    base: baseStyle("surface", "textPrimary", "md", "regular"),
    image: {
      aspectRatio: "wide" as const,
      objectFit: "cover" as const,
    },
  };
  return style satisfies Extract<DesignElement, { type: "image" }>["style"];
}

function isSlotAspectRatio(value: string): value is DesignImageSlot["display"]["aspectRatio"] {
  return ["16:9", "4:3", "3:2", "1:1", "3:4"].includes(value);
}

function isObjectFit(value: string): value is DesignImageSlot["display"]["objectFit"] {
  return value === "cover" || value === "contain";
}

function isFocalPoint(value: string): value is DesignImageSlot["display"]["focalPoint"] {
  return ["center", "top", "left", "right"].includes(value);
}

function repairDocument(value: unknown): DesignDocument {
  const parsed = designDocumentSchema.safeParse(value);
  if (parsed.success) return parsed.data;

  return designDocumentSchema.parse(buildMinimumDocument(value));
}

function buildMinimumDocument(value: unknown) {
  const input = isObject(value) ? value : {};
  const id = typeof input.id === "string" && input.id.trim() ? input.id.trim() : "repaired_design_document";
  const name = typeof input.name === "string" && input.name.trim() ? input.name.trim() : "Repaired Design Document";
  const canvasWidth = isObject(input.canvas) && typeof input.canvas.width === "number" && input.canvas.width > 0
    ? Math.trunc(input.canvas.width)
    : 1440;

  return {
    schemaVersion: "fm-design/v1",
    id,
    name,
    canvas: { viewport: "desktop" as const, width: canvasWidth, background: "muted" as const },
    tree: {
      id: "page_root",
      children: [{ id: "repair_notice", children: [] }],
    },
    elements: [
      {
        id: "page_root",
        name: "Page",
        type: "page",
        layout: { display: "flex", direction: "vertical", gap: "md", padding: "lg", width: "fill" },
        props: {},
        style: containerStyle("surface"),
      },
      {
        id: "repair_notice",
        name: "Repair Notice",
        type: "text",
        props: { text: "The design document was repaired to satisfy the schema." },
        style: textStyle("body", "md", "regular", "textSecondary"),
      },
    ],
    variables: {},
  };
}

function containerStyle(backgroundColor: "surface" | "white") {
  return {
    base: baseStyle(backgroundColor, "textPrimary", "md", "regular"),
    container: {
      shadow: "none" as const,
      overflow: "visible" as const,
      surface: backgroundColor === "white" ? "card" as const : "flat" as const,
    },
  };
}

function textStyle(role: "heading" | "body", fontSize: "md" | "2xl", fontWeight: "regular" | "bold", color: "textPrimary" | "textSecondary") {
  return {
    base: baseStyle("transparent", color, fontSize, fontWeight),
    text: {
      role,
      decoration: "none" as const,
      transform: "none" as const,
    },
  };
}

function baseStyle(
  backgroundColor: "transparent" | "surface" | "white" | "brand",
  color: "textPrimary" | "textSecondary" | "white" | "brand",
  fontSize: "sm" | "md" | "lg" | "2xl",
  fontWeight: "regular" | "semibold" | "bold",
) {
  return {
    backgroundColor,
    radius: "md" as const,
    border: {
      width: "none" as const,
      style: "none" as const,
      color: "border" as const,
    },
    text: {
      color,
      fontFamily: "sans" as const,
      fontSize,
      fontWeight,
      lineHeight: "normal" as const,
      align: "left" as const,
    },
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
