import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LowCodePage } from "../../pages/app/LowCodePage";
import { fallbackDesignDocument, materials } from "./lowcodeData";

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
  });

  it("renders the default customer management design document", () => {
    render(<LowCodePage />);

    expect(screen.getByText("客户管理设计稿 搭建器")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "客户管理" })).toBeInTheDocument();
    expect(screen.getByText("客户列表")).toBeInTheDocument();
  });

  it("adds a material from the palette and selects it", () => {
    render(<LowCodePage />);

    fireEvent.click(screen.getAllByRole("button", { name: /文本/ })[0]);

    expect(screen.getByText("新的文本内容")).toBeInTheDocument();
    expect(screen.getByText("当前选中：文本")).toBeInTheDocument();
  });

  it("only exposes the Flex container in layout materials", () => {
    render(<LowCodePage />);

    expect(screen.getByRole("button", { name: /Flex 容器/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /分区/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /分割线/ })).not.toBeInTheDocument();
  });

  it("uses only current palette materials in the default document", () => {
    const allowedTypes = new Set(["page", ...materials.map((item) => item.type)]);

    expect(fallbackDesignDocument.elements.map((element) => element.type).filter((type) => !allowedTypes.has(type))).toEqual([]);
  });

  it("updates enhanced Flex layout controls and restores them after saving", () => {
    render(<LowCodePage />);

    fireEvent.click(screen.getByRole("button", { name: /Flex 容器/ }));
    fireEvent.click(screen.getByRole("button", { name: "横向排列" }));
    fireEvent.click(screen.getByRole("button", { name: "布局位置：右下" }));
    fireEvent.click(screen.getByRole("button", { name: "固定宽度" }));
    fireEvent.change(screen.getByLabelText("固定宽度数值"), { target: { value: "360" } });
    fireEvent.click(screen.getByRole("button", { name: /保存草稿/ }));

    expect(screen.getByRole("button", { name: "横向排列" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "布局位置：右下" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("允许换行")).toBeChecked();
    expect(screen.getByLabelText("固定宽度数值")).toHaveValue(360);

    render(<LowCodePage />);

    expect(screen.getAllByRole("button", { name: "横向排列" })[0]).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByRole("button", { name: "布局位置：右下" })[0]).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByLabelText("允许换行")[0]).toBeChecked();
    expect(screen.getAllByLabelText("固定宽度数值")[0]).toHaveValue(360);
  });

  it("applies the Flex alignment grid to the canvas", () => {
    const { container } = render(<LowCodePage />);

    fireEvent.click(screen.getByRole("button", { name: /Flex 容器/ }));
    fireEvent.click(screen.getByRole("button", { name: "横向排列" }));
    fireEvent.click(screen.getByRole("button", { name: "布局位置：右下" }));

    const flexContent = container.querySelector('[data-node-id^="node_stack_"] .flex-row') as HTMLElement | null;

    expect(flexContent?.className).toContain("items-end");
    expect(flexContent?.className).toContain("justify-end");
    expect(flexContent?.className).toContain("flex-wrap");
  });

  it("applies fixed Flex sizing to the canvas node", () => {
    const { container } = render(<LowCodePage />);

    fireEvent.click(screen.getByRole("button", { name: /Flex 容器/ }));
    fireEvent.click(screen.getByRole("button", { name: "固定宽度" }));
    fireEvent.change(screen.getByLabelText("固定宽度数值"), { target: { value: "360" } });

    const flexNode = container.querySelector('[data-node-id^="node_stack_"]') as HTMLElement | null;

    expect(flexNode).not.toBeNull();
    expect(flexNode?.style.width).toBe("360px");
  });

  it("renders an empty Flex container as a visible drop area", () => {
    render(<LowCodePage />);

    fireEvent.click(screen.getByRole("button", { name: /Flex 容器/ }));

    expect(screen.getByText("拖入内容")).toBeInTheDocument();
  });

  it("updates text props from the inspector and mirrors the canvas", () => {
    render(<LowCodePage />);

    fireEvent.click(screen.getByText("客户管理"));
    fireEvent.change(screen.getByDisplayValue("客户管理"), { target: { value: "客户总览" } });

    expect(screen.getByRole("heading", { name: "客户总览" })).toBeInTheDocument();
  });

  it("edits canvas text inline and mirrors the inspector", () => {
    const { container } = render(<LowCodePage />);
    const heading = container.querySelector('[data-node-id="title_text"] h2') as HTMLElement | null;

    expect(heading).not.toBeNull();
    fireEvent.pointerDown(heading!);

    const editableHeading = container.querySelector('[data-node-id="title_text"] h2') as HTMLElement;
    editableHeading.textContent = "Inline edited title";
    fireEvent.input(editableHeading);

    expect(editableHeading).toHaveAttribute("contenteditable", "true");
    expect(screen.getByDisplayValue("Inline edited title")).toBeInTheDocument();
  });

  it("deletes a selected node and its canvas content", () => {
    render(<LowCodePage />);

    fireEvent.click(screen.getByText("客户表单"));
    fireEvent.click(screen.getByRole("button", { name: "删除" }));

    expect(screen.queryByText("客户表单")).not.toBeInTheDocument();
  });

  it("moves selected nodes with toolbar controls", () => {
    render(<LowCodePage />);

    const table = screen.getByText("客户列表");
    const form = screen.getByText("客户表单");
    fireEvent.click(form);
    fireEvent.click(screen.getByRole("button", { name: "上移" }));

    expect(Boolean(form.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
  });
});
