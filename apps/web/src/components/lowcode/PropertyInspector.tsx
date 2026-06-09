import type { ReactNode } from "react";
import type { DesignAppearance, DesignElement, DesignLayout } from "@flowmind/shared";
import { Input } from "@flowmind/ui";
import { CustomScrollbar } from "../CustomScrollbar";
import { availableFields, fieldLabels, isContainerElement } from "./lowcodeData";

type LayoutOption<T extends string> = {
  value: T;
  label: string;
};

type AlignmentValue = "start" | "center" | "end";

const spacingOptions: LayoutOption<NonNullable<DesignLayout["gap"]>>[] = [
  { value: "none", label: "无" },
  { value: "xs", label: "很小" },
  { value: "sm", label: "小" },
  { value: "md", label: "中" },
  { value: "lg", label: "大" },
  { value: "xl", label: "很大" }
];

export function PropertyInspector({
  parentElement,
  selectedElement,
  onUpdate,
  onUpdateAppearance,
  onUpdateLayout,
  onUpdateProps
}: {
  parentElement?: DesignElement;
  selectedElement: DesignElement;
  onUpdate: (patch: Partial<DesignElement>) => void;
  onUpdateAppearance: (patch: Partial<DesignAppearance>) => void;
  onUpdateLayout: (patch: Partial<DesignLayout>) => void;
  onUpdateProps: (patch: Record<string, unknown>) => void;
}) {
  return (
    <CustomScrollbar className="h-full min-h-0 border-l border-[#d9e1e8] bg-white max-xl:hidden" variant="slate">
      <div className="p-3.5">
        <div className="text-sm font-bold">属性设置</div>
        <p className="mt-1 text-xs leading-5 text-[#5b6472]">当前选中：{selectedElement.name}</p>

        <div className="mt-4 space-y-4">
          <PropertyGroup title="基础">
            <FieldLabel>节点名称</FieldLabel>
            <Input value={selectedElement.name} className="mt-1 h-9" onChange={(event) => onUpdate({ name: event.target.value })} />
            <FieldLabel className="mt-3">组件类型</FieldLabel>
            <Input value={selectedElement.type} readOnly className="mt-1 h-9 font-mono" />
          </PropertyGroup>

          <FlexLayoutFields selectedElement={selectedElement} parentElement={parentElement} onUpdateLayout={onUpdateLayout} />

          <PropertyGroup title="外观">
            <SelectControl label="语义色" value={selectedElement.appearance?.tone ?? "default"} options={["default", "muted", "brand", "success", "warning", "danger"]} onChange={(value) => onUpdateAppearance({ tone: value as DesignAppearance["tone"] })} />
            <SelectControl label="样式" value={selectedElement.appearance?.variant ?? "plain"} options={["plain", "outlined", "filled", "soft"]} onChange={(value) => onUpdateAppearance({ variant: value as DesignAppearance["variant"] })} />
            <SelectControl label="密度" value={selectedElement.appearance?.density ?? "default"} options={["compact", "default", "comfortable"]} onChange={(value) => onUpdateAppearance({ density: value as DesignAppearance["density"] })} />
          </PropertyGroup>

          <TypeSpecificFields selectedElement={selectedElement} onUpdateProps={onUpdateProps} />
        </div>
      </div>
    </CustomScrollbar>
  );
}

function FlexLayoutFields({
  onUpdateLayout,
  parentElement,
  selectedElement
}: {
  onUpdateLayout: (patch: Partial<DesignLayout>) => void;
  parentElement?: DesignElement;
  selectedElement: DesignElement;
}) {
  const isContainer = isContainerElement(selectedElement.type);
  const parentIsContainer = parentElement ? isContainerElement(parentElement.type) : false;
  const layout = selectedElement.layout ?? {};
  const direction = layout.direction ?? "vertical";

  return (
    <PropertyGroup title={isContainer ? "Flex 容器" : "在父容器中的占位"}>
      {isContainer ? (
        <>
          <SegmentedControl
            label="排列方向"
            value={direction}
            options={[
              { value: "vertical", label: "纵向排列" },
              { value: "horizontal", label: "横向排列" }
            ]}
            onChange={(direction) => onUpdateLayout({ display: "flex", direction })}
          />
          <AlignmentGridControl
            direction={direction}
            align={normalizeAlignment(layout.align)}
            justify={normalizeAlignment(layout.justify)}
            onChange={onUpdateLayout}
          />
          <ToggleControl label="允许换行" checked={layout.wrap ?? direction === "horizontal"} onChange={(wrap) => onUpdateLayout({ wrap })} />
          <SegmentedControl label="间距" value={layout.gap ?? "md"} options={spacingOptions} onChange={(gap) => onUpdateLayout({ gap })} />
          <SegmentedControl label="内边距" value={layout.padding ?? "none"} options={spacingOptions} onChange={(padding) => onUpdateLayout({ padding })} />
          <SizeControls layout={layout} onUpdateLayout={onUpdateLayout} />
        </>
      ) : parentIsContainer ? (
        <>
          <SegmentedControl
            label="占位方式"
            value={layout.grow ?? "none"}
            options={[
              { value: "none", label: "自适应内容" },
              { value: "fill", label: "填满剩余" }
            ]}
            onChange={(grow) => onUpdateLayout({ grow })}
          />
          <SizeControls layout={layout} onUpdateLayout={onUpdateLayout} />
        </>
      ) : (
        <div className="rounded-md bg-[#f8fafb] p-3 text-xs leading-5 text-[#5b6472]">该组件不在 Flex 容器内，暂无子项占位设置。</div>
      )}
    </PropertyGroup>
  );
}

function SizeControls({ layout, onUpdateLayout }: { layout: DesignLayout; onUpdateLayout: (patch: Partial<DesignLayout>) => void }) {
  return (
    <>
      <SegmentedControl
        label="宽度"
        value={layout.width ?? "hug"}
        options={[
          { value: "hug", label: "自适应宽度" },
          { value: "fill", label: "填满宽度" },
          { value: "fixed", label: "固定宽度" }
        ]}
        onChange={(width) => onUpdateLayout({ width, fixedWidth: width === "fixed" ? layout.fixedWidth ?? 320 : layout.fixedWidth })}
      />
      {layout.width === "fixed" ? (
        <NumberControl label="固定宽度数值" value={layout.fixedWidth ?? 320} onChange={(fixedWidth) => onUpdateLayout({ fixedWidth })} />
      ) : null}
      <SegmentedControl
        label="高度"
        value={layout.height ?? "hug"}
        options={[
          { value: "hug", label: "自适应高度" },
          { value: "fill", label: "填满高度" },
          { value: "fixed", label: "固定高度" }
        ]}
        onChange={(height) => onUpdateLayout({ height, fixedHeight: height === "fixed" ? layout.fixedHeight ?? 160 : layout.fixedHeight })}
      />
      {layout.height === "fixed" ? (
        <NumberControl label="固定高度数值" value={layout.fixedHeight ?? 160} onChange={(fixedHeight) => onUpdateLayout({ fixedHeight })} />
      ) : null}
    </>
  );
}

function TypeSpecificFields({ selectedElement, onUpdateProps }: { selectedElement: DesignElement; onUpdateProps: (patch: Record<string, unknown>) => void }) {
  if (selectedElement.type === "text") {
    return (
      <PropertyGroup title="文本">
        <FieldLabel>内容</FieldLabel>
        <Input value={String(selectedElement.props?.text ?? "")} className="mt-1 h-9" onChange={(event) => onUpdateProps({ text: event.target.value })} />
        <SelectControl label="层级" value={String(selectedElement.props?.level ?? "body")} options={["h1", "h2", "body", "caption"]} onChange={(value) => onUpdateProps({ level: value })} />
        <FieldLabel>描述</FieldLabel>
        <Input value={String(selectedElement.props?.description ?? "")} className="mt-1 h-9" onChange={(event) => onUpdateProps({ description: event.target.value })} />
      </PropertyGroup>
    );
  }

  if (selectedElement.type === "button") {
    return (
      <PropertyGroup title="按钮">
        <FieldLabel>按钮文案</FieldLabel>
        <Input value={String(selectedElement.props?.label ?? "")} className="mt-1 h-9" onChange={(event) => onUpdateProps({ label: event.target.value })} />
        <SelectControl label="动作" value={String(selectedElement.props?.action ?? "platformApi")} options={["openForm", "platformApi", "ai", "mcp"]} onChange={(value) => onUpdateProps({ action: value })} />
      </PropertyGroup>
    );
  }

  if (selectedElement.type === "image") {
    return (
      <PropertyGroup title="图片">
        <FieldLabel>替代文本</FieldLabel>
        <Input value={String(selectedElement.props?.alt ?? "")} className="mt-1 h-9" onChange={(event) => onUpdateProps({ alt: event.target.value })} />
        <SelectControl label="比例" value={String(selectedElement.props?.aspectRatio ?? "wide")} options={["wide", "square"]} onChange={(value) => onUpdateProps({ aspectRatio: value })} />
      </PropertyGroup>
    );
  }

  if (selectedElement.type === "input") {
    return (
      <PropertyGroup title="输入框">
        <FieldLabel>标签</FieldLabel>
        <Input value={String(selectedElement.props?.label ?? "")} className="mt-1 h-9" onChange={(event) => onUpdateProps({ label: event.target.value })} />
        <FieldLabel>占位提示</FieldLabel>
        <Input value={String(selectedElement.props?.placeholder ?? "")} className="mt-1 h-9" onChange={(event) => onUpdateProps({ placeholder: event.target.value })} />
      </PropertyGroup>
    );
  }

  if (selectedElement.type === "badge" || selectedElement.type === "divider") {
    return (
      <PropertyGroup title={selectedElement.type === "badge" ? "徽标" : "分割线"}>
        <FieldLabel>文案</FieldLabel>
        <Input value={String(selectedElement.props?.label ?? "")} className="mt-1 h-9" onChange={(event) => onUpdateProps({ label: event.target.value })} />
      </PropertyGroup>
    );
  }

  if (selectedElement.type === "table") {
    return <FieldMultiSelect title="表格列" value={arrayProp(selectedElement.props?.columns)} onChange={(columns) => onUpdateProps({ columns })} />;
  }

  if (selectedElement.type === "filter") {
    return <FieldMultiSelect title="筛选字段" value={arrayProp(selectedElement.props?.fields)} onChange={(fields) => onUpdateProps({ fields })} />;
  }

  if (selectedElement.type === "form") {
    return (
      <>
        <FieldMultiSelect title="表单字段" value={arrayProp(selectedElement.props?.fields)} onChange={(fields) => onUpdateProps({ fields })} />
        <PropertyGroup title="表单模式">
          <SelectControl label="提交方式" value={String(selectedElement.props?.mode ?? "drawer")} options={["drawer", "inline", "modal"]} onChange={(value) => onUpdateProps({ mode: value })} />
        </PropertyGroup>
      </>
    );
  }

  if (selectedElement.type === "stat") {
    return (
      <PropertyGroup title="指标">
        <FieldLabel>标签</FieldLabel>
        <Input value={String(selectedElement.props?.label ?? "")} className="mt-1 h-9" onChange={(event) => onUpdateProps({ label: event.target.value })} />
        <FieldLabel>数值</FieldLabel>
        <Input value={String(selectedElement.props?.value ?? "")} className="mt-1 h-9" onChange={(event) => onUpdateProps({ value: event.target.value })} />
        <FieldLabel>变化</FieldLabel>
        <Input value={String(selectedElement.props?.delta ?? "")} className="mt-1 h-9" onChange={(event) => onUpdateProps({ delta: event.target.value })} />
        <SelectControl label="指标文字对齐" value={String(selectedElement.props?.textAlign ?? "left")} options={["left", "center"]} onChange={(value) => onUpdateProps({ textAlign: value })} />
      </PropertyGroup>
    );
  }

  return (
    <PropertyGroup title="组件">
      <div className="rounded-md bg-[#f8fafb] p-3 text-xs leading-5 text-[#5b6472]">该组件当前只支持通用布局和外观属性。</div>
    </PropertyGroup>
  );
}

function FieldMultiSelect({ onChange, title, value }: { onChange: (fields: string[]) => void; title: string; value: string[] }) {
  return (
    <PropertyGroup title={title}>
      <div className="space-y-2">
        {availableFields.map((field) => (
          <label key={field} className="flex items-center gap-2 rounded-md border border-[#d9e1e8] px-3 py-2 text-sm">
            <input
              type="checkbox"
              checked={value.includes(field)}
              onChange={(event) => {
                const next = event.target.checked ? [...value, field] : value.filter((item) => item !== field);
                onChange(next);
              }}
            />
            <span>{fieldLabels[field] ?? field}</span>
            <span className="ml-auto font-mono text-xs text-[#8a94a3]">{field}</span>
          </label>
        ))}
      </div>
    </PropertyGroup>
  );
}

function AlignmentGridControl({
  align,
  direction,
  justify,
  onChange
}: {
  align: AlignmentValue;
  direction: NonNullable<DesignLayout["direction"]>;
  justify: AlignmentValue;
  onChange: (patch: Partial<DesignLayout>) => void;
}) {
  const selected = alignmentToGridPosition(direction, justify, align);
  const xOptions: AlignmentValue[] = ["start", "center", "end"];
  const yOptions: AlignmentValue[] = ["start", "center", "end"];

  return (
    <div>
      <FieldLabel>内容位置</FieldLabel>
      <div className="mt-1 grid grid-cols-3 gap-1 rounded-md bg-[#eef2f5] p-1" role="group" aria-label="内容位置">
        {yOptions.flatMap((y) =>
          xOptions.map((x) => {
            const active = selected.x === x && selected.y === y;
            const label = alignmentGridLabel(x, y);
            return (
              <button
                key={`${x}-${y}`}
                type="button"
                aria-label={`布局位置：${label}`}
                aria-pressed={active}
                className={`grid h-12 place-items-center rounded-md border transition ${active ? "border-[#0f766e]/35 bg-white shadow-sm ring-1 ring-[#0f766e]/20" : "border-transparent bg-[#f8fafb] hover:border-[#b9c4cf] hover:bg-white"}`}
                onClick={() => onChange(gridPositionToLayout(direction, x, y))}
              >
                <span className={`flex h-8 w-11 rounded border p-1 ${active ? "border-[#9cc8c2] bg-[#e8f4f2]" : "border-[#d9e1e8] bg-[#eef2f5]"} ${previewJustifyClass(x)} ${previewAlignClass(y)}`}>
                  <span className={`h-2 w-2.5 rounded-sm ${active ? "bg-[#0f766e]" : "bg-[#344054]"}`} />
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

function alignmentToGridPosition(direction: NonNullable<DesignLayout["direction"]>, justify: AlignmentValue, align: AlignmentValue) {
  return direction === "horizontal" ? { x: justify, y: align } : { x: align, y: justify };
}

function gridPositionToLayout(direction: NonNullable<DesignLayout["direction"]>, x: AlignmentValue, y: AlignmentValue): Partial<DesignLayout> {
  return direction === "horizontal" ? { justify: x, align: y } : { align: x, justify: y };
}

function normalizeAlignment(value: DesignLayout["align"] | DesignLayout["justify"]): AlignmentValue {
  return value === "center" || value === "end" ? value : "start";
}

function alignmentGridLabel(x: AlignmentValue, y: AlignmentValue) {
  const horizontal = x === "start" ? "左" : x === "center" ? "中" : "右";
  const vertical = y === "start" ? "上" : y === "center" ? "中" : "下";
  return x === "center" && y === "center" ? "居中" : `${horizontal}${vertical}`;
}

function previewJustifyClass(value: AlignmentValue) {
  if (value === "center") return "justify-center";
  if (value === "end") return "justify-end";
  return "justify-start";
}

function previewAlignClass(value: AlignmentValue) {
  if (value === "center") return "items-center";
  if (value === "end") return "items-end";
  return "items-start";
}

function SegmentedControl<T extends string>({ label, onChange, options, value }: { label: string; onChange: (value: T) => void; options: LayoutOption<T>[]; value: T }) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <div className="mt-1 grid grid-cols-2 gap-1 rounded-md bg-[#eef2f5] p-1">
        {options.map((option) => {
          const active = option.value === value;
          return (
            <button
              key={option.value}
              aria-pressed={active}
              className={`min-h-8 rounded px-2 text-xs font-semibold transition ${active ? "bg-white text-[#111827] shadow-sm" : "text-[#5b6472] hover:bg-white/70"}`}
              type="button"
              onClick={() => onChange(option.value)}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ToggleControl({ checked, label, onChange }: { checked: boolean; label: string; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex items-center justify-between rounded-md border border-[#d9e1e8] px-3 py-2 text-sm">
      <span className="font-semibold text-[#5b6472]">{label}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}

function NumberControl({ label, onChange, value }: { label: string; onChange: (value: number) => void; value: number }) {
  return (
    <label className="block">
      <FieldLabel>{label}</FieldLabel>
      <input
        aria-label={label}
        className="mt-1 h-9 w-full rounded-md border border-[#d9e1e8] bg-white px-3 text-sm"
        min={1}
        type="number"
        value={value}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next) && next > 0) onChange(Math.round(next));
        }}
      />
    </label>
  );
}

function SelectControl({ label, onChange, options, value }: { label: string; onChange: (value: string) => void; options: string[]; value: string }) {
  return (
    <label className="block">
      <FieldLabel>{label}</FieldLabel>
      <select className="mt-1 h-9 w-full rounded-md border border-[#d9e1e8] bg-white px-3 text-sm" value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => <option key={option}>{option}</option>)}
      </select>
    </label>
  );
}

function FieldLabel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <span className={`block text-xs font-semibold text-[#5b6472] ${className}`}>{children}</span>;
}

function PropertyGroup({ children, title }: { children: ReactNode; title: string }) {
  return (
    <section className="rounded-lg border border-[#d9e1e8] p-3">
      <h3 className="mb-3 text-sm font-bold">{title}</h3>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function arrayProp(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}
