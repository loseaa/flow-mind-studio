import type { MaterialDropTarget } from "./materialDropResolver";

let dropPlacementIndicator: HTMLElement | null = null;

export function setDropPlacementIndicator(target: MaterialDropTarget | null) {
  if (!target) {
    clearDropPlacementIndicator();
    return;
  }
  const rect = target.element.getBoundingClientRect();
  const indicator = dropPlacementIndicator ?? document.createElement("div");
  indicator.className = `material-drop-placement-indicator material-drop-placement-${target.placement.position} material-drop-placement-${target.placement.axis}`;
  indicator.setAttribute("data-label", placementLabel(target));
  indicator.textContent = "";
  indicator.style.left = `${rect.left}px`;
  indicator.style.top = `${rect.top}px`;
  indicator.style.width = `${rect.width}px`;
  indicator.style.height = `${rect.height}px`;
  if (!dropPlacementIndicator) {
    document.body.appendChild(indicator);
    dropPlacementIndicator = indicator;
  }
}

export function clearDropPlacementIndicator() {
  dropPlacementIndicator?.remove();
  dropPlacementIndicator = null;
}

function placementLabel(target: MaterialDropTarget) {
  if (target.placement.position === "inside") return "松手后放入此容器";
  if (target.placement.axis === "horizontal") return target.placement.position === "before" ? "松手后插入左侧" : "松手后插入右侧";
  return target.placement.position === "before" ? "松手后插入上方" : "松手后插入下方";
}
