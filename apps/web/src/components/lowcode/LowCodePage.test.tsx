import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LowCodePage } from "../../pages/app/LowCodePage";
import { createElementFromMaterial, DEFAULT_LOW_CODE_IMAGE_URL, fallbackDesignDocument, materials } from "./lowcodeData";

vi.mock("interactjs", () => ({
  default: () => ({
    draggable() {
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
  });

  it("renders the default design document", () => {
    const { container } = render(<LowCodePage />);

    expect(container.querySelector('[data-node-id="title_text"] h2')?.textContent).toBeTruthy();
    expect(container.querySelector('[data-node-id="customer_table"]')).not.toBeNull();
  });

  it("adds a material from the palette and selects it", () => {
    const { container } = render(<LowCodePage />);

    clickMaterial(container, "text");

    expect(container.querySelector('[data-node-id^="node_text_"]')).not.toBeNull();
    expect(screen.getByText(/Selected:/).textContent).toContain("文本");
  });

  it("only exposes the Flex container in layout materials", () => {
    render(<LowCodePage />);

    expect(materials.filter((item) => item.type === "stack")).toHaveLength(1);
    expect(materials.some((item) => item.type === "section")).toBe(false);
    expect(materials.some((item) => item.type === "divider")).toBe(false);
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
    fireEvent.change(screen.getByLabelText("Background color"), { target: { value: "muted" } });
    clickSave(container);

    const savedDocument = JSON.parse(localStorage.getItem("flowmind.lowcode.designDocument") ?? "{}") as typeof fallbackDesignDocument;
    const savedTitle = savedDocument.elements.find((element) => element.id === "title_text");

    expect(savedTitle?.style?.base.backgroundColor).toBe("muted");
    expect(heading.style.backgroundColor).toBe("rgb(248, 250, 251)");
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
    fireEvent.change(screen.getByLabelText("Text align"), { target: { value: "center" } });

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

function clickMaterial(container: HTMLElement, type: string) {
  const material = container.querySelector(`[data-material-type="${type}"]`) as HTMLElement | null;
  expect(material).not.toBeNull();
  fireEvent.click(material!);
}

function clickSave(container: HTMLElement) {
  const save = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("保存")) as HTMLElement | undefined;
  expect(save).toBeTruthy();
  fireEvent.click(save!);
}
