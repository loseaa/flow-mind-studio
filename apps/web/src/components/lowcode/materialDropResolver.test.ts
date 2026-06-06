import { beforeEach, describe, expect, it } from "vitest";
import { resolveMaterialDropTarget } from "./materialDropResolver";

describe("resolveMaterialDropTarget", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("inserts before or after vertical siblings based on pointer half", () => {
    const root = setupDropzone("parent", "vertical", rect(0, 0, 300, 300));
    const first = setupNode("first", "parent", rect(0, 0, 300, 100));
    const second = setupNode("second", "parent", rect(0, 100, 300, 100));
    root.append(first, second);
    document.body.append(root);

    expect(resolveMaterialDropTarget({ clientX: 80, clientY: 120 })?.placement).toMatchObject({
      parentId: "parent",
      index: 1,
      position: "before"
    });
    expect(resolveMaterialDropTarget({ clientX: 80, clientY: 180 })?.placement).toMatchObject({
      parentId: "parent",
      index: 2,
      position: "after"
    });
  });

  it("inserts before or after horizontal siblings based on pointer half", () => {
    const root = setupDropzone("row", "horizontal", rect(0, 0, 400, 120));
    const left = setupNode("left", "row", rect(0, 0, 200, 120));
    const right = setupNode("right", "row", rect(200, 0, 200, 120));
    root.append(left, right);
    document.body.append(root);

    expect(resolveMaterialDropTarget({ clientX: 220, clientY: 60 })?.placement).toMatchObject({
      parentId: "row",
      index: 1,
      position: "before"
    });
    expect(resolveMaterialDropTarget({ clientX: 360, clientY: 60 })?.placement).toMatchObject({
      parentId: "row",
      index: 2,
      position: "after"
    });
  });

  it("uses the deepest container when dropping into nested blank space", () => {
    const root = setupDropzone("page", "vertical", rect(0, 0, 500, 500));
    const nestedFrame = setupNode("nested", "page", rect(40, 40, 260, 260));
    nestedFrame.classList.add("design-node-dropzone");
    nestedFrame.setAttribute("data-drop-parent-id", "nested");
    nestedFrame.setAttribute("data-layout-direction", "vertical");
    root.append(nestedFrame);
    document.body.append(root);

    const target = resolveMaterialDropTarget({ clientX: 120, clientY: 180 });

    expect(target?.placement).toMatchObject({
      parentId: "nested",
      position: "inside"
    });
    expect(target?.placement.index).toBeUndefined();
  });

  it("resolves before, inside, and after zones when hovering a container node", () => {
    const root = setupDropzone("page", "vertical", rect(0, 0, 500, 500));
    const container = setupNode("container", "page", rect(40, 80, 260, 240));
    container.classList.add("design-node-dropzone");
    container.setAttribute("data-drop-parent-id", "container");
    container.setAttribute("data-layout-direction", "vertical");
    root.append(container);
    document.body.append(root);

    expect(resolveMaterialDropTarget({ clientX: 120, clientY: 100 })?.placement).toMatchObject({
      parentId: "page",
      index: 0,
      position: "before"
    });
    expect(resolveMaterialDropTarget({ clientX: 120, clientY: 190 })?.placement).toMatchObject({
      parentId: "container",
      position: "inside"
    });
    expect(resolveMaterialDropTarget({ clientX: 120, clientY: 300 })?.placement).toMatchObject({
      parentId: "page",
      index: 1,
      position: "after"
    });
  });

  it("uses horizontal edge zones for containers inside a horizontal parent", () => {
    const root = setupDropzone("row", "horizontal", rect(0, 0, 600, 220));
    const container = setupNode("container", "row", rect(100, 40, 240, 140));
    container.classList.add("design-node-dropzone");
    container.setAttribute("data-drop-parent-id", "container");
    container.setAttribute("data-layout-direction", "vertical");
    root.append(container);
    document.body.append(root);

    expect(resolveMaterialDropTarget({ clientX: 120, clientY: 100 })?.placement).toMatchObject({
      parentId: "row",
      index: 0,
      position: "before"
    });
    expect(resolveMaterialDropTarget({ clientX: 330, clientY: 100 })?.placement).toMatchObject({
      parentId: "row",
      index: 1,
      position: "after"
    });
  });

  it("ignores the currently dragged node when resolving canvas reorder targets", () => {
    const root = setupDropzone("parent", "vertical", rect(0, 0, 300, 300));
    const dragged = setupNode("dragged", "parent", rect(0, 0, 300, 100));
    const target = setupNode("target", "parent", rect(0, 100, 300, 100));
    root.append(dragged, target);
    document.body.append(root);

    expect(resolveMaterialDropTarget({ clientX: 80, clientY: 180, ignoredNodeIds: ["dragged"] })?.placement).toMatchObject({
      parentId: "parent",
      index: 1,
      position: "after"
    });
  });
});

function setupDropzone(id: string, direction: "vertical" | "horizontal", box: DOMRect) {
  const element = setupElement(box);
  element.className = "design-node-dropzone";
  element.setAttribute("data-drop-parent-id", id);
  element.setAttribute("data-layout-direction", direction);
  return element;
}

function setupNode(id: string, parentId: string, box: DOMRect) {
  const element = setupElement(box);
  element.className = "design-sortable-node";
  element.setAttribute("data-node-id", id);
  element.setAttribute("data-parent-id", parentId);
  return element;
}

function setupElement(box: DOMRect) {
  const element = document.createElement("div");
  element.getBoundingClientRect = () => box;
  return element;
}

function rect(left: number, top: number, width: number, height: number) {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({})
  } as DOMRect;
}
