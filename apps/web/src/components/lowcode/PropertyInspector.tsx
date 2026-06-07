import type { ReactNode } from "react";
import type { DesignElement, DesignElementStyle, DesignLayout } from "@flowmind/shared";
import { Input } from "@flowmind/ui";
import { CustomScrollbar } from "../CustomScrollbar";
import { availableFields, fieldLabels, isContainerElement } from "./lowcodeData";

type LayoutOption<T extends string> = {
  value: T;
  label: string;
};

type AlignmentValue = "start" | "center" | "end";

const spacingOptions: LayoutOption<NonNullable<DesignLayout["gap"]>>[] = [
  { value: "none", label: "None" },
  { value: "xs", label: "XS" },
  { value: "sm", label: "SM" },
  { value: "md", label: "MD" },
  { value: "lg", label: "LG" },
  { value: "xl", label: "XL" }
];

const colorOptions = ["transparent", "surface", "muted", "white", "brand", "success", "warning", "danger", "textPrimary", "textSecondary", "border"];

export function PropertyInspector({
  parentElement,
  selectedElement,
  onUpdate,
  onUpdateLayout,
  onUpdateProps,
  onUpdateStyle
}: {
  parentElement?: DesignElement;
  selectedElement: DesignElement;
  onUpdate: (patch: Partial<DesignElement>) => void;
  onUpdateLayout: (patch: Partial<DesignLayout>) => void;
  onUpdateProps: (patch: Record<string, unknown>) => void;
  onUpdateStyle: (patch: Partial<DesignElementStyle>) => void;
}) {
  return (
    <CustomScrollbar className="h-full min-h-0 border-l border-[#d9e1e8] bg-white max-xl:hidden" variant="slate">
      <div className="p-3.5">
        <div className="text-sm font-bold">Properties</div>
        <p className="mt-1 text-xs leading-5 text-[#5b6472]">Selected: {selectedElement.name}</p>

        <div className="mt-4 space-y-4">
          <PropertyGroup title="Basics">
            <FieldLabel>Node name</FieldLabel>
            <Input value={selectedElement.name} className="mt-1 h-9" onChange={(event) => onUpdate({ name: event.target.value })} />
            <FieldLabel className="mt-3">Material type</FieldLabel>
            <Input value={selectedElement.type} readOnly className="mt-1 h-9 font-mono" />
          </PropertyGroup>

          <FlexLayoutFields selectedElement={selectedElement} parentElement={parentElement} onUpdateLayout={onUpdateLayout} />
          <StyleFields selectedElement={selectedElement} onUpdateStyle={onUpdateStyle} />
          <TypeSpecificFields selectedElement={selectedElement} onUpdateProps={onUpdateProps} onUpdateStyle={onUpdateStyle} />
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
    <PropertyGroup title={isContainer ? "Flex container" : "Flex item"}>
      {isContainer ? (
        <>
          <SegmentedControl
            label="Direction"
            value={direction}
            options={[
              { value: "vertical", label: "Vertical" },
              { value: "horizontal", label: "Horizontal" }
            ]}
            onChange={(direction) => onUpdateLayout({ display: "flex", direction })}
          />
          <AlignmentGridControl direction={direction} align={normalizeAlignment(layout.align)} justify={normalizeAlignment(layout.justify)} onChange={onUpdateLayout} />
          <ToggleControl label="Allow wrap" checked={layout.wrap ?? direction === "horizontal"} onChange={(wrap) => onUpdateLayout({ wrap })} />
          <SegmentedControl label="Gap" value={layout.gap ?? "md"} options={spacingOptions} onChange={(gap) => onUpdateLayout({ gap })} />
          <SegmentedControl label="Padding" value={layout.padding ?? "none"} options={spacingOptions} onChange={(padding) => onUpdateLayout({ padding })} />
          <SizeControls layout={layout} onUpdateLayout={onUpdateLayout} />
        </>
      ) : parentIsContainer ? (
        <>
          <SegmentedControl
            label="Grow"
            value={layout.grow ?? "none"}
            options={[
              { value: "none", label: "Hug" },
              { value: "fill", label: "Fill" }
            ]}
            onChange={(grow) => onUpdateLayout({ grow })}
          />
          <SizeControls layout={layout} onUpdateLayout={onUpdateLayout} />
        </>
      ) : (
        <div className="rounded-md bg-[#f8fafb] p-3 text-xs leading-5 text-[#5b6472]">This material is not inside a Flex container.</div>
      )}
    </PropertyGroup>
  );
}

function StyleFields({ selectedElement, onUpdateStyle }: { selectedElement: DesignElement; onUpdateStyle: (patch: Partial<DesignElementStyle>) => void }) {
  const base = selectedElement.style.base;
  return (
    <PropertyGroup title="Base style">
      <SelectControl label="Background color" value={base.backgroundColor} options={colorOptions} onChange={(backgroundColor) => onUpdateStyle({ base: { backgroundColor } } as Partial<DesignElementStyle>)} />
      <SelectControl label="Radius" value={base.radius} options={["none", "xs", "sm", "md", "lg", "xl", "full"]} onChange={(radius) => onUpdateStyle({ base: { radius } } as Partial<DesignElementStyle>)} />
      <SelectControl label="Border width" value={base.border.width} options={["none", "sm", "md", "lg"]} onChange={(width) => onUpdateStyle({ base: { border: { width } } } as Partial<DesignElementStyle>)} />
      <SelectControl label="Border style" value={base.border.style} options={["solid", "dashed", "none"]} onChange={(style) => onUpdateStyle({ base: { border: { style } } } as Partial<DesignElementStyle>)} />
      <SelectControl label="Border color" value={base.border.color} options={colorOptions} onChange={(color) => onUpdateStyle({ base: { border: { color } } } as Partial<DesignElementStyle>)} />
      <SelectControl label="Text color" value={base.text.color} options={colorOptions} onChange={(color) => onUpdateStyle({ base: { text: { color } } } as Partial<DesignElementStyle>)} />
      <SelectControl label="Font size" value={base.text.fontSize} options={["xs", "sm", "md", "lg", "xl", "2xl", "3xl"]} onChange={(fontSize) => onUpdateStyle({ base: { text: { fontSize } } } as Partial<DesignElementStyle>)} />
      <SelectControl label="Font weight" value={base.text.fontWeight} options={["regular", "medium", "semibold", "bold"]} onChange={(fontWeight) => onUpdateStyle({ base: { text: { fontWeight } } } as Partial<DesignElementStyle>)} />
      <SelectControl label="Text align" value={base.text.align} options={["left", "center", "right"]} onChange={(align) => onUpdateStyle({ base: { text: { align } } } as Partial<DesignElementStyle>)} />
    </PropertyGroup>
  );
}

function TypeSpecificFields({
  selectedElement,
  onUpdateProps,
  onUpdateStyle
}: {
  selectedElement: DesignElement;
  onUpdateProps: (patch: Record<string, unknown>) => void;
  onUpdateStyle: (patch: Partial<DesignElementStyle>) => void;
}) {
  if (selectedElement.type === "text") {
    return (
      <>
        <PropertyGroup title="Text">
          <FieldLabel>Content</FieldLabel>
          <Input value={String(selectedElement.props?.text ?? "")} className="mt-1 h-9" onChange={(event) => onUpdateProps({ text: event.target.value })} />
          <FieldLabel>Description</FieldLabel>
          <Input value={String(selectedElement.props?.description ?? "")} className="mt-1 h-9" onChange={(event) => onUpdateProps({ description: event.target.value })} />
        </PropertyGroup>
        <PropertyGroup title="Text style">
          <SelectControl label="Text role" value={selectedElement.style.text.role} options={["heading", "subheading", "body", "caption"]} onChange={(role) => onUpdateStyle({ text: { role } } as Partial<DesignElementStyle>)} />
          <SelectControl label="Decoration" value={selectedElement.style.text.decoration} options={["none", "underline", "lineThrough"]} onChange={(decoration) => onUpdateStyle({ text: { decoration } } as Partial<DesignElementStyle>)} />
          <SelectControl label="Transform" value={selectedElement.style.text.transform} options={["none", "uppercase", "lowercase", "capitalize"]} onChange={(transform) => onUpdateStyle({ text: { transform } } as Partial<DesignElementStyle>)} />
        </PropertyGroup>
      </>
    );
  }

  if (selectedElement.type === "button") {
    return (
      <>
        <PropertyGroup title="Button">
          <FieldLabel>Label</FieldLabel>
          <Input value={String(selectedElement.props?.label ?? "")} className="mt-1 h-9" onChange={(event) => onUpdateProps({ label: event.target.value })} />
          <SelectControl label="Action" value={String(selectedElement.props?.action ?? "platformApi")} options={["openForm", "platformApi", "ai", "mcp"]} onChange={(value) => onUpdateProps({ action: value })} />
        </PropertyGroup>
        <PropertyGroup title="Button style">
          <SelectControl label="Button size" value={selectedElement.style.button.size} options={["sm", "md", "lg"]} onChange={(size) => onUpdateStyle({ button: { size } } as Partial<DesignElementStyle>)} />
          <SelectControl label="Button emphasis" value={selectedElement.style.button.emphasis} options={["primary", "secondary", "ghost"]} onChange={(emphasis) => onUpdateStyle({ button: { emphasis } } as Partial<DesignElementStyle>)} />
        </PropertyGroup>
      </>
    );
  }

  if (selectedElement.type === "image") {
    return (
      <>
        <PropertyGroup title="Image">
          <FieldLabel>Alt text</FieldLabel>
          <Input value={String(selectedElement.props?.alt ?? "")} className="mt-1 h-9" onChange={(event) => onUpdateProps({ alt: event.target.value })} />
        </PropertyGroup>
        <PropertyGroup title="Image style">
          <SelectControl label="Aspect ratio" value={selectedElement.style.image.aspectRatio} options={["wide", "square", "portrait"]} onChange={(aspectRatio) => onUpdateStyle({ image: { aspectRatio } } as Partial<DesignElementStyle>)} />
          <SelectControl label="Object fit" value={selectedElement.style.image.objectFit} options={["cover", "contain", "fill"]} onChange={(objectFit) => onUpdateStyle({ image: { objectFit } } as Partial<DesignElementStyle>)} />
        </PropertyGroup>
      </>
    );
  }

  if (selectedElement.type === "input") {
    return (
      <>
        <PropertyGroup title="Input">
          <FieldLabel>Label</FieldLabel>
          <Input value={String(selectedElement.props?.label ?? "")} className="mt-1 h-9" onChange={(event) => onUpdateProps({ label: event.target.value })} />
          <FieldLabel>Placeholder</FieldLabel>
          <Input value={String(selectedElement.props?.placeholder ?? "")} className="mt-1 h-9" onChange={(event) => onUpdateProps({ placeholder: event.target.value })} />
        </PropertyGroup>
        <ControlStyleFields style={selectedElement.style} onUpdateStyle={onUpdateStyle} />
      </>
    );
  }

  if (selectedElement.type === "badge") {
    return (
      <>
        <PropertyGroup title="Badge">
          <FieldLabel>Label</FieldLabel>
          <Input value={String(selectedElement.props?.label ?? "")} className="mt-1 h-9" onChange={(event) => onUpdateProps({ label: event.target.value })} />
        </PropertyGroup>
        <PropertyGroup title="Badge style">
          <SelectControl label="Badge size" value={selectedElement.style.badge.size} options={["sm", "md", "lg"]} onChange={(size) => onUpdateStyle({ badge: { size } } as Partial<DesignElementStyle>)} />
          <SelectControl label="Badge shape" value={selectedElement.style.badge.shape} options={["square", "pill"]} onChange={(shape) => onUpdateStyle({ badge: { shape } } as Partial<DesignElementStyle>)} />
          <SelectControl label="Badge emphasis" value={selectedElement.style.badge.emphasis} options={["soft", "solid", "outline"]} onChange={(emphasis) => onUpdateStyle({ badge: { emphasis } } as Partial<DesignElementStyle>)} />
        </PropertyGroup>
      </>
    );
  }

  if (selectedElement.type === "divider") {
    return (
      <>
        <PropertyGroup title="Divider">
          <FieldLabel>Label</FieldLabel>
          <Input value={String(selectedElement.props?.label ?? "")} className="mt-1 h-9" onChange={(event) => onUpdateProps({ label: event.target.value })} />
        </PropertyGroup>
        <PropertyGroup title="Divider style">
          <SelectControl label="Divider direction" value={selectedElement.style.divider.direction} options={["horizontal", "vertical"]} onChange={(direction) => onUpdateStyle({ divider: { direction } } as Partial<DesignElementStyle>)} />
          <SelectControl label="Divider thickness" value={selectedElement.style.divider.thickness} options={["sm", "md", "lg"]} onChange={(thickness) => onUpdateStyle({ divider: { thickness } } as Partial<DesignElementStyle>)} />
          <SelectControl label="Divider label position" value={selectedElement.style.divider.labelPosition} options={["start", "center", "end"]} onChange={(labelPosition) => onUpdateStyle({ divider: { labelPosition } } as Partial<DesignElementStyle>)} />
        </PropertyGroup>
      </>
    );
  }

  if (selectedElement.type === "table") {
    return (
      <>
        <FieldMultiSelect title="Table columns" value={arrayProp(selectedElement.props?.columns)} onChange={(columns) => onUpdateProps({ columns })} />
        <PropertyGroup title="Table style">
          <SelectControl label="Table density" value={selectedElement.style.table.density} options={["compact", "default", "comfortable"]} onChange={(density) => onUpdateStyle({ table: { density } } as Partial<DesignElementStyle>)} />
          <SelectControl label="Header background" value={selectedElement.style.table.headerBackground} options={colorOptions} onChange={(headerBackground) => onUpdateStyle({ table: { headerBackground } } as Partial<DesignElementStyle>)} />
          <SelectControl label="Border mode" value={selectedElement.style.table.borderMode} options={["none", "rows", "grid"]} onChange={(borderMode) => onUpdateStyle({ table: { borderMode } } as Partial<DesignElementStyle>)} />
          <ToggleControl label="Zebra rows" checked={selectedElement.style.table.zebra} onChange={(zebra) => onUpdateStyle({ table: { zebra } } as Partial<DesignElementStyle>)} />
        </PropertyGroup>
      </>
    );
  }

  if (selectedElement.type === "filter") {
    return (
      <>
        <FieldMultiSelect title="Filter fields" value={arrayProp(selectedElement.props?.fields)} onChange={(fields) => onUpdateProps({ fields })} />
        <ControlStyleFields style={selectedElement.style} onUpdateStyle={onUpdateStyle} />
      </>
    );
  }

  if (selectedElement.type === "form") {
    return (
      <>
        <FieldMultiSelect title="Form fields" value={arrayProp(selectedElement.props?.fields)} onChange={(fields) => onUpdateProps({ fields })} />
        <PropertyGroup title="Form">
          <SelectControl label="Submit mode" value={String(selectedElement.props?.mode ?? "drawer")} options={["drawer", "inline", "modal"]} onChange={(value) => onUpdateProps({ mode: value })} />
        </PropertyGroup>
        <ControlStyleFields style={selectedElement.style} onUpdateStyle={onUpdateStyle} />
      </>
    );
  }

  if (selectedElement.type === "stat") {
    return (
      <>
        <PropertyGroup title="Stat">
          <FieldLabel>Label</FieldLabel>
          <Input value={String(selectedElement.props?.label ?? "")} className="mt-1 h-9" onChange={(event) => onUpdateProps({ label: event.target.value })} />
          <FieldLabel>Value</FieldLabel>
          <Input value={String(selectedElement.props?.value ?? "")} className="mt-1 h-9" onChange={(event) => onUpdateProps({ value: event.target.value })} />
          <FieldLabel>Delta</FieldLabel>
          <Input value={String(selectedElement.props?.delta ?? "")} className="mt-1 h-9" onChange={(event) => onUpdateProps({ delta: event.target.value })} />
        </PropertyGroup>
        <PropertyGroup title="Stat style">
          <SelectControl label="Value size" value={selectedElement.style.stat.valueSize} options={["md", "lg", "xl"]} onChange={(valueSize) => onUpdateStyle({ stat: { valueSize } } as Partial<DesignElementStyle>)} />
          <SelectControl label="Trend position" value={selectedElement.style.stat.trendPosition} options={["inline", "below"]} onChange={(trendPosition) => onUpdateStyle({ stat: { trendPosition } } as Partial<DesignElementStyle>)} />
        </PropertyGroup>
      </>
    );
  }

  if (selectedElement.type === "page" || selectedElement.type === "section" || selectedElement.type === "stack") {
    return (
      <PropertyGroup title="Container style">
        <SelectControl label="Shadow" value={selectedElement.style.container.shadow} options={["none", "sm", "md", "lg"]} onChange={(shadow) => onUpdateStyle({ container: { shadow } } as Partial<DesignElementStyle>)} />
        <SelectControl label="Overflow" value={selectedElement.style.container.overflow} options={["visible", "hidden", "auto"]} onChange={(overflow) => onUpdateStyle({ container: { overflow } } as Partial<DesignElementStyle>)} />
        <SelectControl label="Surface" value={selectedElement.style.container.surface} options={["flat", "card", "panel"]} onChange={(surface) => onUpdateStyle({ container: { surface } } as Partial<DesignElementStyle>)} />
      </PropertyGroup>
    );
  }

  return null;
}

function ControlStyleFields({ style, onUpdateStyle }: { style: Extract<DesignElementStyle, { control: unknown }>; onUpdateStyle: (patch: Partial<DesignElementStyle>) => void }) {
  return (
    <PropertyGroup title="Control style">
      <SelectControl label="Control size" value={style.control.size} options={["sm", "md", "lg"]} onChange={(size) => onUpdateStyle({ control: { size } } as Partial<DesignElementStyle>)} />
      <SelectControl label="Label position" value={style.control.labelPosition} options={["top", "left", "hidden"]} onChange={(labelPosition) => onUpdateStyle({ control: { labelPosition } } as Partial<DesignElementStyle>)} />
      <SegmentedControl label="Field gap" value={style.control.fieldGap} options={spacingOptions} onChange={(fieldGap) => onUpdateStyle({ control: { fieldGap } } as Partial<DesignElementStyle>)} />
    </PropertyGroup>
  );
}

function SizeControls({ layout, onUpdateLayout }: { layout: DesignLayout; onUpdateLayout: (patch: Partial<DesignLayout>) => void }) {
  return (
    <>
      <SegmentedControl
        label="Width"
        value={layout.width ?? "hug"}
        options={[
          { value: "hug", label: "Hug width" },
          { value: "fill", label: "Fill width" },
          { value: "fixed", label: "Fixed width" }
        ]}
        onChange={(width) => onUpdateLayout({ width, fixedWidth: width === "fixed" ? layout.fixedWidth ?? 320 : layout.fixedWidth })}
      />
      {layout.width === "fixed" ? <NumberControl label="Fixed width value" value={layout.fixedWidth ?? 320} onChange={(fixedWidth) => onUpdateLayout({ fixedWidth })} /> : null}
      <SegmentedControl
        label="Height"
        value={layout.height ?? "hug"}
        options={[
          { value: "hug", label: "Hug height" },
          { value: "fill", label: "Fill height" },
          { value: "fixed", label: "Fixed height" }
        ]}
        onChange={(height) => onUpdateLayout({ height, fixedHeight: height === "fixed" ? layout.fixedHeight ?? 160 : layout.fixedHeight })}
      />
      {layout.height === "fixed" ? <NumberControl label="Fixed height value" value={layout.fixedHeight ?? 160} onChange={(fixedHeight) => onUpdateLayout({ fixedHeight })} /> : null}
    </>
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
      <FieldLabel>Content position</FieldLabel>
      <div className="mt-1 grid grid-cols-3 gap-1 rounded-md bg-[#eef2f5] p-1" role="group" aria-label="Content position">
        {yOptions.flatMap((y) =>
          xOptions.map((x) => {
            const active = selected.x === x && selected.y === y;
            const label = alignmentGridLabel(x, y);
            return (
              <button
                key={`${x}-${y}`}
                type="button"
                aria-label={`Layout position: ${label}`}
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
  const horizontal = x === "start" ? "left" : x === "center" ? "center" : "right";
  const vertical = y === "start" ? "top" : y === "center" ? "middle" : "bottom";
  return x === "center" && y === "center" ? "center" : `${horizontal} ${vertical}`;
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
