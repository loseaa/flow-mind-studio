import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LowCodePage } from "../../pages/app/LowCodePage";

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

  it("updates text props from the inspector and mirrors the canvas", () => {
    render(<LowCodePage />);

    fireEvent.click(screen.getByText("客户管理"));
    fireEvent.change(screen.getByDisplayValue("客户管理"), { target: { value: "客户总览" } });

    expect(screen.getByRole("heading", { name: "客户总览" })).toBeInTheDocument();
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
