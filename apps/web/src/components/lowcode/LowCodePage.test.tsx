import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { designDocumentSchema } from "@flowmind/shared";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { aiGeneratedDesignDocument } from "./aiGeneratedDesignDocument";
import { LowCodeCustomMaterialPage } from "../../pages/app/LowCodeCustomMaterialPage";
import { LowCodePage } from "../../pages/app/LowCodePage";
import { clearDropPlacementIndicator, setDropPlacementIndicator } from "./dropPlacementIndicator";
import { complexMaterials, createElementFromMaterial, DEFAULT_LOW_CODE_IMAGE_URL, defaultBackgroundImageUrl, fallbackDesignDocument, materials } from "./lowcodeData";

const interactMock = vi.hoisted(() => ({
  draggableCalls: [] as Array<{ selector: string; config: { listeners?: Record<string, (event: Record<string, unknown>) => void> } | undefined }>
}));

vi.mock("interactjs", () => ({
  default: (selector: string) => ({
    draggable(config?: { listeners?: Record<string, (event: Record<string, unknown>) => void> }) {
      interactMock.draggableCalls.push({ selector, config });
      return { unset: vi.fn() };
    },
    dropzone() {
      return { unset: vi.fn() };
    }
  })
}));

describe("LowCodePage design builder", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    clearDropPlacementIndicator();
    interactMock.draggableCalls.length = 0;
  });

  it("renders the default design document", () => {
    const { container } = render(<LowCodePage />);
    const header = container.querySelector('[data-node-id="header_section"] .flex-row') as HTMLElement | null;
    const headerElement = fallbackDesignDocument.elements.find((element) => element.id === "header_section");

    expect(container.querySelector('[data-node-id="title_text"] h2')?.textContent).toBeTruthy();
    expect(container.querySelector('[data-node-id="customer_table"]')).not.toBeNull();
    expect(headerElement?.style?.base.backgroundImage).toBe(defaultBackgroundImageUrl);
    expect(header?.style.backgroundImage).toContain(defaultBackgroundImageUrl);
  });


  it("preserves the AI conversation state when switching the left panel tab", () => {
    render(<LowCodePage />);

    fireEvent.click(screen.getByRole("button", { name: "AI 对话" }));
    fireEvent.change(screen.getByPlaceholderText(/例如：/), { target: { value: "创建一个音乐播放器页面" } });
    fireEvent.click(screen.getByRole("button", { name: "物料" }));
    fireEvent.click(screen.getByRole("button", { name: "AI 对话" }));

    expect(screen.getByPlaceholderText(/例如：/)).toHaveValue("创建一个音乐播放器页面");
  });
  it("renders the injected AI design document without loading stored drafts", () => {
    localStorage.setItem("flowmind.lowcode.designDocument", JSON.stringify(fallbackDesignDocument));

    const { container } = render(<LowCodePage initialDocument={aiGeneratedDesignDocument} loadStoredDocument={false} />);

    expect(aiGeneratedDesignDocument.id).toBe("doc1");
    expect(aiGeneratedDesignDocument.elements).toHaveLength(30);
    expect(container.querySelector('[data-node-id="page1"]')).not.toBeNull();
    expect(container.querySelector('[data-node-id="page_title"] h2')?.textContent).toBe("Laptop Product Introduction");
    expect(container.querySelector('[data-node-id="ai_content_visual_1"] img')).not.toBeNull();
    expect(container.querySelector('[data-node-id="ai_content_visual_2"] img')).not.toBeNull();
    expect((container.querySelector('[data-node-id="section1"] section') as HTMLElement | null)?.style.backgroundImage).toContain("data:image/svg+xml;base64");
    expect(container.querySelector('[data-node-id="customer_table"]')).toBeNull();
  });
  it("renders image slot sizing and focal point metadata on the canvas", () => {
    const document = structuredClone(fallbackDesignDocument);
    const header = document.elements.find((element) => element.id === "header_section");
    const heroImage = document.elements.find((element) => element.id === "hero_image");

    expect(header).toBeDefined();
    expect(heroImage).toBeDefined();
    header!.props = {
      ...header!.props,
      imageSlotId: "slot_background_test",
      imageSlot: {
        id: "slot_background_test",
        parentId: "header_section",
        role: "hero",
        placement: "background",
        display: { aspectRatio: "16:9", width: "fill", minHeight: 360, maxHeight: 420, objectFit: "contain", focalPoint: "right" },
        generation: { width: 1536, height: 864, safeArea: "left" }
      }
    };
    heroImage!.props = {
      ...heroImage!.props,
      imageSlotId: "slot_inline_test",
      imageSlot: {
        id: "slot_inline_test",
        parentId: "hero_image",
        role: "card",
        placement: "inline",
        display: { aspectRatio: "1:1", width: "half", minHeight: 160, maxHeight: 200, objectFit: "contain", focalPoint: "top" },
        generation: { width: 800, height: 800, safeArea: "none" }
      }
    };

    const { container } = render(<LowCodePage initialDocument={designDocumentSchema.parse(document)} loadStoredDocument={false} />);

    const headerNode = container.querySelector('[data-node-id="header_section"] [data-image-slot="true"]') as HTMLElement | null;
    const imageSlot = container.querySelector('[data-node-id="hero_image"] [data-image-slot="slot_inline_test"]') as HTMLElement | null;
    const image = imageSlot?.querySelector("img") as HTMLImageElement | null;

    expect(headerNode).toHaveAttribute("data-image-slot", "true");
    expect(headerNode).toHaveAttribute("data-image-slot-id", "slot_background_test");
    expect(headerNode).toHaveAttribute("data-image-slot-role", "hero");
    expect(headerNode).toHaveAttribute("data-image-slot-safe-area", "left");
    const overlay = container.querySelector('[data-node-id="header_section"] [data-image-slot-overlay="slot_background_test"]') as HTMLElement | null;

    expect(headerNode).toHaveStyle({ minHeight: "360px", maxHeight: "420px", backgroundSize: "contain", backgroundPosition: "right center", backgroundRepeat: "no-repeat" });
    expect(overlay).toHaveStyle({ background: "linear-gradient(90deg, rgba(255,255,255,0.78) 0%, rgba(255,255,255,0.48) 42%, rgba(255,255,255,0) 72%)" });
    expect(imageSlot).toHaveAttribute("data-image-slot-role", "card");
    expect(imageSlot).toHaveAttribute("data-image-slot-placement", "inline");
    expect(imageSlot).toHaveStyle({ aspectRatio: "1 / 1", width: "50%", maxWidth: "100%", flexBasis: "50%", minHeight: "160px", maxHeight: "200px" });
    expect(image).toHaveStyle({ objectFit: "contain", objectPosition: "center top" });
  });
  it("adds a material from the palette and selects it", () => {
    const { container } = render(<LowCodePage />);

    clickMaterial(container, "text");

    expect(container.querySelector('[data-node-id^="node_text_"]')).not.toBeNull();
    expect(screen.getByText(/Selected:/).textContent).toContain("文本");
  });

  it("adds an editable complex material tree and saves a valid design document", () => {
    const { container } = render(<LowCodePage />);

    clickComplexMaterial(container, "tabs");
    clickSave(container);

    expect(container.querySelector('[data-node-id^="node_complex_tabs_"][data-node-id$="_root"]')).not.toBeNull();
    expect(container.querySelector('[data-node-id*="_active_item"]')).not.toBeNull();
    expect(container.querySelector('[data-node-id*="_active_badge"]')).not.toBeNull();
    expect(container.querySelector('[data-node-id*="_active_line"]')).not.toBeNull();

    const savedDocument = JSON.parse(localStorage.getItem("flowmind.lowcode.designDocument") ?? "{}");
    const parsed = designDocumentSchema.safeParse(savedDocument);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.elements.some((element) => element.id.includes("_active_text") && element.type === "text")).toBe(true);
    expect(parsed.data.elements.some((element) => element.id.includes("_active_badge") && element.type === "badge")).toBe(true);
    expect(parsed.data.elements.some((element) => element.id.includes("_active_line") && element.type === "shape")).toBe(true);
  });

  it("shows complex materials by default and keeps basic materials one tab away", () => {
    const { container } = render(<LowCodePage />);

    expect(screen.getByRole("button", { name: "复杂物料" })).toHaveAttribute("aria-pressed", "true");
    expect(container.querySelector('[data-complex-material-id="tabs"]')).not.toBeNull();
    expect(container.querySelector('[data-material-type="text"]')).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "基础物料" }));

    expect(screen.getByRole("button", { name: "基础物料" })).toHaveAttribute("aria-pressed", "true");
    expect(container.querySelector('[data-material-type="text"]')).not.toBeNull();
  });

  it("summarizes the selected complex material root and its basic materials", () => {
    const { container } = render(<LowCodePage />);

    clickComplexMaterial(container, "customer-card");

    expect(container.querySelector('[data-node-id^="node_complex_customer_card_"][data-node-id$="_root"]')).not.toBeNull();
    expect(container.querySelector('[data-node-id*="_amount"]')).not.toBeNull();
    expect(container.querySelector('[data-node-id*="_action"]')).not.toBeNull();
  });

  it("exposes variables in the left sidebar tab", () => {
    render(<LowCodePage />);

    expect(screen.getByRole("button", { name: "变量" })).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(screen.getByRole("button", { name: "变量" }));

    expect(screen.getByRole("button", { name: "变量" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("全局变量")).toBeInTheDocument();
    expect(screen.getByText("Path")).toBeInTheDocument();
    expect(screen.getByText("Value")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "新增变量" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "高级 JSON" })).toBeInTheDocument();
    expect(screen.queryByLabelText(/Variable default value:/)).not.toBeInTheDocument();
  });

  it("does not show variable management in the right property inspector", () => {
    const { container } = render(<LowCodePage />);
    const inspector = container.querySelector('[data-property-inspector="true"]') as HTMLElement | null;

    expect(inspector).not.toBeNull();
    expect(inspector?.textContent).not.toContain("全局变量");
    expect(inspector?.textContent).not.toContain("新增变量");
  });

  it("only exposes the Flex container in layout materials and keeps divider as a basic material", () => {
    render(<LowCodePage />);

    expect(materials.filter((item) => item.type === "stack")).toHaveLength(1);
    expect(materials.some((item) => item.type === "section")).toBe(false);
    expect(materials.some((item) => item.type === "divider")).toBe(true);
  });

  it("exposes shape materials and inserts a schema-valid circle", () => {
    const { container } = render(<LowCodePage />);

    fireEvent.click(screen.getByRole("button", { name: "基础物料" }));
    const circle = container.querySelector('[data-material-id="shape-circle"]') as HTMLElement | null;
    expect(circle).not.toBeNull();
    fireEvent.click(circle!);
    clickSave(container);

    const savedDocument = JSON.parse(localStorage.getItem("flowmind.lowcode.designDocument") ?? "{}");
    const parsed = designDocumentSchema.safeParse(savedDocument);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const shape = parsed.data.elements.find((element) => element.type === "shape");
    expect(shape?.props?.kind).toBe("circle");
  });

  it("switches the basic line material between horizontal and vertical", () => {
    const { container } = render(<LowCodePage />);

    fireEvent.click(screen.getByRole("button", { name: "基础物料" }));
    const line = container.querySelector('[data-material-id="shape-line"]') as HTMLElement | null;
    expect(line).not.toBeNull();
    fireEvent.click(line!);

    expect(screen.getByRole("button", { name: "Horizontal" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Vertical" }));

    const linePreview = container.querySelector('[data-node-id^="node_shape_"] [data-shape-line]') as HTMLElement | null;
    expect(screen.getByRole("button", { name: "Vertical" })).toHaveAttribute("aria-pressed", "true");
    expect(linePreview).toHaveStyle({ width: "1px", height: "100%" });

    clickSave(container);
    const savedDocument = JSON.parse(localStorage.getItem("flowmind.lowcode.designDocument") ?? "{}");
    const parsed = designDocumentSchema.safeParse(savedDocument);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const savedLine = parsed.data.elements.find((element) => element.type === "shape");
    expect(savedLine?.type).toBe("shape");
    if (!savedLine || savedLine.type !== "shape") return;
    expect(savedLine.style.shape.kind).toBe("line");
    expect(savedLine.style.shape.direction).toBe("vertical");
  });

  it("creates a custom complex material from the builder route and inserts it into the canvas", () => {
    const { container } = renderCustomMaterialRoutes("/app/lowcode/materials/new");

    expect(container.querySelector('[data-custom-complex-save]')).toBeDisabled();

    fireEvent.click(container.querySelector('[data-builder-material-id="text"]') as HTMLElement);
    fireEvent.change(screen.getByLabelText("Custom material name"), { target: { value: "Customer mini block" } });
    fireEvent.change(screen.getByLabelText("Custom material description"), { target: { value: "Reusable text block" } });
    fireEvent.click(container.querySelector('[data-custom-complex-save]') as HTMLElement);

    const stored = JSON.parse(localStorage.getItem("flowmind.lowcode.customComplexMaterials") ?? "[]") as Array<{ label: string; desc: string; composition: string[] }>;
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ label: "Customer mini block", desc: "Reusable text block" });
    expect(stored[0].composition.length).toBeGreaterThan(0);

    const customCard = container.querySelector('[data-complex-material-id^="custom_"]') as HTMLElement | null;
    expect(customCard).not.toBeNull();
    fireEvent.click(customCard!);

    clickSave(container);
    const savedDocument = JSON.parse(localStorage.getItem("flowmind.lowcode.designDocument") ?? "{}");
    const parsed = designDocumentSchema.safeParse(savedDocument);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.elements.some((element) => element.id.startsWith("node_complex_custom_") && element.id.endsWith("_root"))).toBe(true);
    expect(parsed.data.elements.some((element) => element.id.startsWith("node_complex_custom_") && element.type === "text")).toBe(true);
  });

  it("drags a basic material into the custom complex material builder canvas", () => {
    const { container } = renderCustomMaterialRoutes("/app/lowcode/materials/new");
    const root = container.querySelector('[data-node-id="custom_builder_root"]') as HTMLElement | null;
    const material = container.querySelector('[data-builder-material-id="text"]') as HTMLElement | null;
    expect(root).not.toBeNull();
    expect(material).not.toBeNull();
    root!.getBoundingClientRect = () => ({ bottom: 500, height: 420, left: 300, right: 900, top: 80, width: 600, x: 300, y: 80, toJSON: () => ({}) });
    material!.getBoundingClientRect = () => ({ bottom: 52, height: 36, left: 16, right: 220, top: 16, width: 204, x: 16, y: 16, toJSON: () => ({}) });

    const registration = interactMock.draggableCalls.find((call) => call.selector === "[data-builder-material-id]");
    expect(registration).toBeTruthy();
    act(() => {
      registration?.config?.listeners?.end?.({ target: material, clientX: 360, clientY: 160 });
    });

    expect(container.querySelector('[data-node-id^="node_text_"]')).not.toBeNull();
  });

  it("persists custom complex materials and generates fresh ids on repeated insertion", () => {
    const { container, unmount } = renderCustomMaterialRoutes("/app/lowcode/materials/new");

    fireEvent.click(container.querySelector('[data-builder-material-id="button"]') as HTMLElement);
    fireEvent.change(screen.getByLabelText("Custom material name"), { target: { value: "Action block" } });
    fireEvent.change(screen.getByLabelText("Custom material description"), { target: { value: "Reusable action" } });
    fireEvent.click(container.querySelector('[data-custom-complex-save]') as HTMLElement);

    unmount();
    const rerendered = render(<LowCodePage />);
    const customCard = rerendered.container.querySelector('[data-complex-material-id^="custom_"]') as HTMLElement | null;
    expect(customCard).not.toBeNull();

    fireEvent.click(customCard!);
    fireEvent.click(customCard!);
    clickSave(rerendered.container);

    const savedDocument = JSON.parse(localStorage.getItem("flowmind.lowcode.designDocument") ?? "{}");
    const parsed = designDocumentSchema.safeParse(savedDocument);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const customIds = parsed.data.elements.filter((element) => element.id.startsWith("node_complex_custom_")).map((element) => element.id);
    expect(customIds.length).toBeGreaterThan(3);
    expect(new Set(customIds).size).toBe(customIds.length);
    expect(parsed.data.elements.filter((element) => element.id.startsWith("node_complex_custom_") && element.id.endsWith("_root"))).toHaveLength(2);
  });

  it("cancels custom complex material creation without writing local storage", () => {
    const { container } = renderCustomMaterialRoutes("/app/lowcode/materials/new");

    fireEvent.click(container.querySelector('[data-builder-material-id="text"]') as HTMLElement);
    fireEvent.change(screen.getByLabelText("Custom material name"), { target: { value: "Discard me" } });
    fireEvent.click(container.querySelector('[data-custom-complex-cancel]') as HTMLElement);

    expect(localStorage.getItem("flowmind.lowcode.customComplexMaterials")).toBeNull();
    expect(container.querySelector('[data-complex-material-id^="custom_"]')).toBeNull();
  });

  it("matches the Pencil complex material structure keywords", () => {
    const customerCard = complexMaterials.find((item) => item.id === "customer-card")?.createTemplate();
    const tableSection = complexMaterials.find((item) => item.id === "table-section")?.createTemplate();
    const approvalCard = complexMaterials.find((item) => item.id === "approval-card")?.createTemplate();

    const customerNames = customerCard?.elements.map((element) => element.name) ?? [];
    const tableNames = tableSection?.elements.map((element) => element.name) ?? [];
    expect(customerNames).toEqual(expect.arrayContaining(["Selection root label", "Customer top editable group", "Customer action row"]));
    expect(customerNames.some((name) => name.includes("row"))).toBe(true);
    expect(tableNames).toContain("Table block header");
    expect(tableNames.length).toBeGreaterThan(3);
    expect(approvalCard?.elements.some((element) => element.type === "shape")).toBe(true);
  });

  it("wraps every complex material in a basic container shell", () => {
    for (const material of complexMaterials) {
      const template = material.createTemplate();
      const rootElement = template.elements.find((element) => element.id === template.root.id);
      const contentId = template.root.children?.[0]?.id;
      const contentElement = template.elements.find((element) => element.id === contentId);

      expect(rootElement?.type).toBe("stack");
      expect(rootElement?.layout?.height).toBe("fill");
      expect(rootElement?.style.base.backgroundColor).toBe("transparent");
      expect(rootElement?.style.base.border.width).toBe("none");
      expect(template.root.children).toHaveLength(1);
      expect(contentId).toContain("_content");
      expect(contentElement?.type).toBe("stack");
      expect(contentElement?.name).toContain("Complex Material");
    }
  });

  it("defaults every material and complex material child to fill height", () => {
    for (const material of materials) {
      const element = createElementFromMaterial(material.id);
      expect(element.layout?.height).toBe("fill");
      expect(element.layout?.fixedHeight).toBeUndefined();
    }

    for (const material of complexMaterials) {
      const template = material.createTemplate();
      for (const element of template.elements) {
        expect(element.layout?.height).toBe("fill");
        expect(element.layout?.fixedHeight).toBeUndefined();
      }
    }
  });

  it("gives complex material roots full-height canvas occupancy", () => {
    const { container } = render(<LowCodePage />);

    clickComplexMaterial(container, "customer-card");

    const root = container.querySelector('[data-node-id^="node_complex_customer_card_"][data-node-id$="_root"]') as HTMLElement | null;
    expect(root).not.toBeNull();
    expect(root).toHaveStyle({ width: "420px", height: "100%" });
    const contentWrap = Array.from(root?.children ?? []).find((child) => child.classList.contains("h-full"));
    expect(contentWrap).toHaveClass("h-full", "w-full");
  });

  it("stretches full-height container visuals to their reserved canvas slot", () => {
    const { container } = render(<LowCodePage />);

    clickComplexMaterial(container, "tabs");

    const root = container.querySelector('[data-node-id^="node_complex_tabs_"][data-node-id$="_root"]') as HTMLElement | null;
    const visibleContainer = root?.querySelector(".min-h-8 > div") as HTMLElement | null;
    expect(root).toHaveStyle({ height: "100%" });
    expect(visibleContainer).toHaveClass("h-full");
  });

  it("stretches inner complex material widgets to their canvas slots", () => {
    const { container } = render(<LowCodePage />);

    clickComplexMaterial(container, "customer-card");
    clickComplexMaterial(container, "table-section");

    const stat = container.querySelector('[data-node-id*="_amount"] [data-stat-card]') as HTMLElement | null;
    const filter = container.querySelector('[data-node-id*="table_section_"][data-node-id*="_filter"] > div > div') as HTMLElement | null;
    const table = container.querySelector('[data-node-id*="table_section_"][data-node-id*="_table"] > div > div') as HTMLElement | null;

    expect(stat).toHaveClass("h-full");
    expect(filter).toHaveClass("h-full");
    expect(table).toHaveClass("h-full");
  });

  it("uses only current palette materials in the default document", () => {
    const allowedTypes = new Set(["page", ...materials.map((item) => item.type)]);

    expect(fallbackDesignDocument.elements.map((element) => element.type).filter((type) => !allowedTypes.has(type))).toEqual([]);
  });

  it("uses typed style instead of appearance for default and new materials", () => {
    expect(fallbackDesignDocument.elements.every((element) => element.style?.base)).toBe(true);
    expect(fallbackDesignDocument.elements.every((element) => !("appearance" in element))).toBe(true);

    const textElement = createElementFromMaterial("text");

    expect(textElement.type).toBe("text");
    expect(textElement.style.base.text.fontSize).toBe("md");
    if (textElement.type === "text") expect(textElement.style.text.role).toBe("body");
    expect("appearance" in textElement).toBe(false);
  });

  it("uses an OSS-hosted image for the default image material", () => {
    const hero = fallbackDesignDocument.elements.find((element) => element.id === "hero_image");

    expect(hero?.props?.src).toBe(DEFAULT_LOW_CODE_IMAGE_URL);
  });

  it("uploads an image material and inserts it into the canvas", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        url: "https://flowmindstudio.oss-cn-beijing.aliyuncs.com/low-code/backgrounds/assets/uploaded.png",
        key: "low-code/backgrounds/assets/uploaded.png",
        name: "uploaded.png",
        mimeType: "image/png",
        sizeBytes: 6
      })
    } as Response);
    render(<LowCodePage />);

    const file = new File(["image!"], "uploaded.png", { type: "image/png" });
    fireEvent.click(screen.getByRole("button", { name: "基础物料" }));
    fireEvent.change(screen.getByLabelText("上传图片物料"), { target: { files: [file] } });

    const image = await screen.findByRole("img", { name: "uploaded.png" });
    expect(image).toHaveAttribute("src", "https://flowmindstudio.oss-cn-beijing.aliyuncs.com/low-code/backgrounds/assets/uploaded.png");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:4000/api/low-code/assets/images",
      expect.objectContaining({ method: "POST", body: expect.any(FormData) })
    );
  });

  it("updates base style from the inspector and persists it in the design document", () => {
    const { container } = render(<LowCodePage />);
    const heading = container.querySelector('[data-node-id="title_text"] h2') as HTMLElement;

    fireEvent.click(heading);
    fireEvent.click(screen.getByRole("button", { name: "Choose Background color: None" }));
    fireEvent.click(screen.getByRole("button", { name: "Background color: Muted" }));
    clickSave(container);

    const savedDocument = JSON.parse(localStorage.getItem("flowmind.lowcode.designDocument") ?? "{}") as typeof fallbackDesignDocument;
    const savedTitle = savedDocument.elements.find((element) => element.id === "title_text");

    expect(savedTitle?.style?.base.backgroundColor).toBe("muted");
    expect(heading.style.backgroundColor).toBe("rgb(248, 250, 251)");
  });

  it("prioritizes display controls above basics and keeps color choices in a popover", () => {
    const { container } = render(<LowCodePage />);
    const heading = container.querySelector('[data-node-id="title_text"] h2') as HTMLElement;

    fireEvent.click(heading);

    const inspector = container.querySelector('[data-property-inspector="true"]') as HTMLElement;
    const inspectorText = inspector.textContent ?? "";
    expect(inspectorText.indexOf("Text")).toBeGreaterThanOrEqual(0);
    expect(inspectorText.indexOf("Basics")).toBeGreaterThanOrEqual(0);
    expect(inspectorText.indexOf("Text")).toBeLessThan(inspectorText.indexOf("Basics"));

    expect(screen.getByRole("button", { name: "Choose Background color: None" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Background color: Muted" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Choose Background color: None" }));

    expect(screen.getByRole("button", { name: "Background color: Muted" })).toBeInTheDocument();
  });

  it("applies container shadow settings to the canvas", () => {
    const { container } = render(<LowCodePage />);
    const stack = container.querySelector('[data-node-id="content_stack"]') as HTMLElement;

    fireEvent.click(stack);
    fireEvent.click(screen.getByRole("button", { name: "Shadow: Lg" }));

    const stackInnerFrame = Array.from(stack.children).find((child) => child.classList.contains("min-h-8")) as HTMLElement;
    const stackContent = stackInnerFrame.firstElementChild as HTMLElement;
    expect(stackContent).toHaveStyle({ boxShadow: "0 9px 16px rgba(16, 24, 40, 0.2)" });
  });

  it("stores a background image URL and renders it from the inspector", () => {
    const { container } = render(<LowCodePage />);
    const heading = container.querySelector('[data-node-id="title_text"] h2') as HTMLElement;
    const imageUrl = "https://oss.example.com/flowmind/backgrounds/header.png";

    fireEvent.click(heading);
    fireEvent.change(screen.getByLabelText("Background image URL"), { target: { value: imageUrl } });
    clickSave(container);

    const savedDocument = JSON.parse(localStorage.getItem("flowmind.lowcode.designDocument") ?? "{}") as typeof fallbackDesignDocument;
    const savedTitle = savedDocument.elements.find((element) => element.id === "title_text");

    expect(savedTitle?.style?.base.backgroundImage).toBe(imageUrl);
    expect(heading.style.backgroundImage).toContain(imageUrl);
    expect(JSON.stringify(savedTitle)).not.toContain("data:image");
  });

  it("uploads a local background image file and stores the returned OSS URL", async () => {
    const uploadedUrl = "https://cdn.example.com/assets/low-code/backgrounds/header.png";
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ url: uploadedUrl })
    })) as unknown as typeof fetch;
    try {
      const { container } = render(<LowCodePage />);
      const heading = container.querySelector('[data-node-id="title_text"] h2') as HTMLElement;
      const file = new File([new Uint8Array([1, 2, 3])], "header.png", { type: "image/png" });

      fireEvent.click(heading);
      fireEvent.change(screen.getByLabelText("Upload background image"), { target: { files: [file] } });

      await waitFor(() => expect(heading.style.backgroundImage).toContain(uploadedUrl));
      clickSave(container);

      const savedDocument = JSON.parse(localStorage.getItem("flowmind.lowcode.designDocument") ?? "{}") as typeof fallbackDesignDocument;
      const savedTitle = savedDocument.elements.find((element) => element.id === "title_text");

      expect(globalThis.fetch).toHaveBeenCalledWith("http://localhost:4000/api/low-code/assets/background-image", expect.objectContaining({ method: "POST" }));
      expect(savedTitle?.style?.base.backgroundImage).toBe(uploadedUrl);
      expect(JSON.stringify(savedTitle)).not.toContain("data:image");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("clears stale material drop indicators before opening the background image file picker", () => {
    const target = document.createElement("div");
    target.getBoundingClientRect = () => ({ bottom: 100, height: 80, left: 10, right: 110, top: 20, width: 100, x: 10, y: 20, toJSON: () => ({}) });
    document.body.appendChild(target);
    setDropPlacementIndicator({ element: target, placement: { axis: "vertical", parentId: "page_root", position: "inside" } });

    render(<LowCodePage />);
    fireEvent.click(screen.getByText("Upload file"));

    expect(document.querySelector(".material-drop-placement-indicator")).toBeNull();
    target.remove();
  });

  it("clears stale material drop indicators when the window loses focus", () => {
    const target = document.createElement("div");
    target.getBoundingClientRect = () => ({ bottom: 100, height: 80, left: 10, right: 110, top: 20, width: 100, x: 10, y: 20, toJSON: () => ({}) });
    document.body.appendChild(target);
    setDropPlacementIndicator({ element: target, placement: { axis: "vertical", parentId: "page_root", position: "inside" } });

    render(<LowCodePage />);
    window.dispatchEvent(new Event("blur"));

    expect(document.querySelector(".material-drop-placement-indicator")).toBeNull();
    target.remove();
  });

  it("shows the backend upload error instead of a generic OSS failure message", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      status: 404,
      json: async () => ({ message: "Cannot POST /api/low-code/assets/background-image" })
    })) as unknown as typeof fetch;
    try {
      render(<LowCodePage />);
      const file = new File([new Uint8Array([1, 2, 3])], "header.png", { type: "image/png" });

      fireEvent.change(screen.getByLabelText("Upload background image"), { target: { files: [file] } });

      await waitFor(() => expect(screen.getByText(/Cannot POST/)).toBeInTheDocument());
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("only shows typography controls for text nodes", () => {
    const { container } = render(<LowCodePage />);

    expect(screen.queryByText("Font size")).not.toBeInTheDocument();
    expect(screen.queryByText("Font weight")).not.toBeInTheDocument();
    expect(screen.queryByText("Text align")).not.toBeInTheDocument();

    const heading = container.querySelector('[data-node-id="title_text"] h2') as HTMLElement;
    fireEvent.click(heading);

    expect(screen.getByText("Font size")).toBeInTheDocument();
    expect(screen.getByText("Font weight")).toBeInTheDocument();
    expect(screen.getByText("Text align")).toBeInTheDocument();

    const table = container.querySelector('[data-node-id="customer_table"]') as HTMLElement;
    fireEvent.click(table);

    expect(screen.queryByText("Font size")).not.toBeInTheDocument();
    expect(screen.queryByText("Font weight")).not.toBeInTheDocument();
    expect(screen.queryByText("Text align")).not.toBeInTheDocument();
  });

  it("updates enhanced Flex layout controls and restores them after saving", () => {
    const { container } = render(<LowCodePage />);

    clickMaterial(container, "stack");
    fireEvent.click(screen.getByRole("button", { name: "Horizontal" }));
    fireEvent.click(screen.getByRole("button", { name: "Layout position: right bottom" }));
    fireEvent.click(screen.getByRole("button", { name: "Fixed width" }));
    fireEvent.change(screen.getByLabelText("Fixed width value"), { target: { value: "360" } });
    clickSave(container);

    expect(screen.getByRole("button", { name: "Horizontal" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Layout position: right bottom" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Allow wrap")).toBeChecked();
    expect(screen.getByLabelText("Fixed width value")).toHaveValue(360);

    render(<LowCodePage />);

    expect(screen.getAllByRole("button", { name: "Horizontal" })[0]).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByRole("button", { name: "Layout position: right bottom" })[0]).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByLabelText("Allow wrap")[0]).toBeChecked();
    expect(screen.getAllByLabelText("Fixed width value")[0]).toHaveValue(360);
  });

  it("applies the Flex alignment grid to the canvas", () => {
    const { container } = render(<LowCodePage />);

    clickMaterial(container, "stack");
    fireEvent.click(screen.getByRole("button", { name: "Horizontal" }));
    fireEvent.click(screen.getByRole("button", { name: "Layout position: right bottom" }));

    const flexContent = container.querySelector('[data-node-id^="node_stack_"] .flex-row') as HTMLElement | null;

    expect(flexContent?.className).toContain("items-end");
    expect(flexContent?.className).toContain("justify-end");
    expect(flexContent?.className).toContain("flex-wrap");
  });

  it("applies fixed Flex sizing to the canvas node", () => {
    const { container } = render(<LowCodePage />);

    clickMaterial(container, "stack");
    fireEvent.click(screen.getByRole("button", { name: "Fixed width" }));
    fireEvent.change(screen.getByLabelText("Fixed width value"), { target: { value: "360" } });

    const flexNode = container.querySelector('[data-node-id^="node_stack_"]') as HTMLElement | null;

    expect(flexNode).not.toBeNull();
    expect(flexNode?.style.width).toBe("360px");
  });

  it("centers text inside metric cards when configured", () => {
    const { container } = render(<LowCodePage />);

    fireEvent.click(screen.getByText("新增线索"));
    fireEvent.click(screen.getByRole("button", { name: "Text align: Center" }));

    const stat = container.querySelector('[data-node-id="stat_leads"] [data-stat-card]') as HTMLElement | null;
    expect(stat?.style.textAlign).toBe("center");
  });

  it("renders an empty Flex container as a visible drop area", () => {
    const { container } = render(<LowCodePage />);

    clickMaterial(container, "stack");

    expect(container.textContent).toContain("拖入内容");
  });

  it("updates text props from the inspector and mirrors the canvas", () => {
    const { container } = render(<LowCodePage />);
    const heading = container.querySelector('[data-node-id="title_text"] h2') as HTMLElement;

    fireEvent.click(heading);
    fireEvent.change(screen.getByDisplayValue(heading.textContent ?? ""), { target: { value: "Customer overview" } });

    expect(screen.getByRole("heading", { name: "Customer overview" })).toBeInTheDocument();
  });

  it("resolves document variables in canvas text while saving template strings", () => {
    const document = structuredClone(fallbackDesignDocument);
    document.variables = { customer: { name: "Acme" } };
    const title = document.elements.find((element) => element.id === "title_text");
    if (title) title.props = { ...title.props, text: "Customer: {{customer.name}}" };
    localStorage.setItem("flowmind.lowcode.designDocument", JSON.stringify(document));

    const { container } = render(<LowCodePage />);

    expect(screen.getByRole("heading", { name: "Customer: Acme" })).toBeInTheDocument();
    clickSave(container);

    const savedDocument = JSON.parse(localStorage.getItem("flowmind.lowcode.designDocument") ?? "{}") as typeof fallbackDesignDocument;
    const savedTitle = savedDocument.elements.find((element) => element.id === "title_text");
    expect(savedDocument.variables).toEqual({ customer: { name: "Acme" } });
    expect(savedTitle?.props?.text).toBe("Customer: {{customer.name}}");
  });

  it("updates the canvas when table variable values change", () => {
    const document = structuredClone(fallbackDesignDocument);
    document.variables = { customer: { name: "Acme" } };
    const title = document.elements.find((element) => element.id === "title_text");
    if (title) title.props = { ...title.props, text: "Customer: {{customer.name}}" };
    localStorage.setItem("flowmind.lowcode.designDocument", JSON.stringify(document));

    render(<LowCodePage />);

    fireEvent.click(screen.getByRole("button", { name: "变量" }));
    fireEvent.change(screen.getByLabelText("Variable value: customer.name"), { target: { value: "Beta" } });

    expect(screen.getByRole("heading", { name: "Customer: Beta" })).toBeInTheDocument();
  });

  it("saves array variables created from table paths", () => {
    const document = structuredClone(fallbackDesignDocument);
    document.variables = {};
    localStorage.setItem("flowmind.lowcode.designDocument", JSON.stringify(document));

    const { container } = render(<LowCodePage />);

    fireEvent.click(screen.getByRole("button", { name: "变量" }));
    fireEvent.click(screen.getByRole("button", { name: "新增变量" }));
    fireEvent.change(screen.getByLabelText("Variable path: variable1"), { target: { value: "order.items.0.title" } });
    fireEvent.change(screen.getByLabelText("Variable value: order.items.0.title"), { target: { value: "Starter" } });
    clickSave(container);

    const savedDocument = JSON.parse(localStorage.getItem("flowmind.lowcode.designDocument") ?? "{}") as typeof fallbackDesignDocument;
    expect(savedDocument.variables).toEqual({ order: { items: [{ title: "Starter" }] } });
  });

  it("keeps the last valid variables when JSON editing is invalid", () => {
    const document = structuredClone(fallbackDesignDocument);
    document.variables = { customerName: "Acme" };
    const title = document.elements.find((element) => element.id === "title_text");
    if (title) title.props = { ...title.props, text: "Customer: {{customerName}}" };
    localStorage.setItem("flowmind.lowcode.designDocument", JSON.stringify(document));

    render(<LowCodePage />);

    fireEvent.click(screen.getByRole("button", { name: "变量" }));
    fireEvent.click(screen.getByRole("button", { name: "高级 JSON" }));
    fireEvent.change(screen.getByLabelText("Variables JSON"), { target: { value: "{ invalid json" } });

    expect(screen.getByText("Invalid JSON object")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Customer: Acme" })).toBeInTheDocument();
  });

  it("syncs table rows after valid advanced JSON editing", () => {
    const document = structuredClone(fallbackDesignDocument);
    document.variables = { customerName: "Acme" };
    localStorage.setItem("flowmind.lowcode.designDocument", JSON.stringify(document));

    render(<LowCodePage />);

    fireEvent.click(screen.getByRole("button", { name: "变量" }));
    fireEvent.click(screen.getByRole("button", { name: "高级 JSON" }));
    fireEvent.change(screen.getByLabelText("Variables JSON"), { target: { value: '{\n  "customer": {\n    "name": "Beta"\n  }\n}' } });

    expect(screen.getByDisplayValue("customer.name")).toBeInTheDocument();
    expect(screen.getByLabelText("Variable value: customer.name")).toHaveValue("Beta");
  });

  it("uses content as the only editable text-node body", () => {
    const { container } = render(<LowCodePage />);
    const heading = container.querySelector('[data-node-id="title_text"] h2') as HTMLElement;

    expect(container.textContent).not.toContain("查看客户阶段");

    fireEvent.click(heading);

    expect(screen.getByText("Content")).toBeInTheDocument();
    expect(screen.queryByText("Description")).not.toBeInTheDocument();
  });

  it("edits canvas text inline and mirrors the inspector", () => {
    const { container } = render(<LowCodePage />);
    const heading = container.querySelector('[data-node-id="title_text"] h2') as HTMLElement;

    fireEvent.pointerDown(heading);
    heading.textContent = "Inline edited title";
    fireEvent.input(heading);

    expect(heading).toHaveAttribute("contenteditable", "true");
    expect(screen.getByDisplayValue("Inline edited title")).toBeInTheDocument();
  });

  it("deletes a selected node and its canvas content", () => {
    const { container } = render(<LowCodePage />);
    const form = container.querySelector('[data-node-id="customer_form"]') as HTMLElement;

    fireEvent.click(form);
    fireEvent.click(screen.getByRole("button", { name: "删除" }));

    expect(container.querySelector('[data-node-id="customer_form"]')).toBeNull();
  });

  it("moves selected nodes with toolbar controls", () => {
    const { container } = render(<LowCodePage />);
    const table = container.querySelector('[data-node-id="customer_table"]') as HTMLElement;
    const form = container.querySelector('[data-node-id="customer_form"]') as HTMLElement;

    fireEvent.click(form);
    fireEvent.click(screen.getByRole("button", { name: "上移" }));

    expect(Boolean(form.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
  });
});

function renderCustomMaterialRoutes(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/app/lowcode/materials/new" element={<LowCodeCustomMaterialPage />} />
        <Route path="/app/lowcode" element={<LowCodePage />} />
      </Routes>
    </MemoryRouter>
  );
}

function clickMaterial(container: HTMLElement, type: string) {
  if (!container.querySelector(`[data-material-type="${type}"]`)) {
    fireEvent.click(screen.getByRole("button", { name: "基础物料" }));
  }
  const material = container.querySelector(`[data-material-type="${type}"]`) as HTMLElement | null;
  expect(material).not.toBeNull();
  fireEvent.click(material!);
}

function clickComplexMaterial(container: HTMLElement, id: string) {
  const material = container.querySelector(`[data-complex-material-id="${id}"]`) as HTMLElement | null;
  expect(material).not.toBeNull();
  fireEvent.click(material!);
}

function clickSave(container: HTMLElement) {
  const save = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("保存")) as HTMLElement | undefined;
  expect(save).toBeTruthy();
  fireEvent.click(save!);
}
