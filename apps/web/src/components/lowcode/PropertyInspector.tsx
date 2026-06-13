import { useRef, useState, type ReactNode } from "react";
import { AlignCenter, AlignLeft, AlignRight } from "lucide-react";
import type { DesignElement, DesignElementStyle, DesignLayout, DesignVariables } from "@flowmind/shared";
import { Input } from "@flowmind/ui";
import { CustomScrollbar } from "../CustomScrollbar";
import { availableFields, fieldLabels, isContainerElement } from "./lowcodeData";
import { clearDropPlacementIndicator } from "./dropPlacementIndicator";
import { VariableTextEditor } from "./VariableTextEditor";

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

const colorMeta: Record<string, { label: string; value: string; text?: string; ring?: string }> = {
  transparent: { label: "None", value: "linear-gradient(135deg,#fff 0 45%,#d9e1e8 45% 55%,#fff 55% 100%)", text: "#5b6472" },
  surface: { label: "Surface", value: "#ffffff", text: "#101828" },
  muted: { label: "Muted", value: "#f8fafb", text: "#101828" },
  white: { label: "White", value: "#ffffff", text: "#101828" },
  brand: { label: "Brand", value: "#0f766e", text: "#ffffff" },
  success: { label: "Success", value: "#12a879", text: "#ffffff" },
  warning: { label: "Warning", value: "#f59e0b", text: "#101828" },
  danger: { label: "Danger", value: "#dc2626", text: "#ffffff" },
  textPrimary: { label: "Primary text", value: "#101828", text: "#ffffff" },
  textSecondary: { label: "Secondary text", value: "#5b6472", text: "#ffffff" },
  border: { label: "Border", value: "#d9e1e8", text: "#101828" }
};

const radiusOptions: LayoutOption<string>[] = [
  { value: "none", label: "None" },
  { value: "xs", label: "XS" },
  { value: "sm", label: "SM" },
  { value: "md", label: "MD" },
  { value: "lg", label: "LG" },
  { value: "xl", label: "XL" },
  { value: "full", label: "Pill" }
];

const borderWidthOptions: LayoutOption<string>[] = [
  { value: "none", label: "None" },
  { value: "sm", label: "1px" },
  { value: "md", label: "2px" },
  { value: "lg", label: "3px" }
];

const fontSizeOptions: LayoutOption<string>[] = [
  { value: "xs", label: "12" },
  { value: "sm", label: "14" },
  { value: "md", label: "16" },
  { value: "lg", label: "18" },
  { value: "xl", label: "22" },
  { value: "2xl", label: "28" },
  { value: "3xl", label: "34" }
];

const fontWeightOptions: LayoutOption<string>[] = [
  { value: "regular", label: "Regular" },
  { value: "medium", label: "Medium" },
  { value: "semibold", label: "Semibold" },
  { value: "bold", label: "Bold" }
];

export function PropertyInspector({
  parentElement,
  selectedElement,
  onUpdate,
  onUpdateLayout,
  onUpdateProps,
  onUpdateStyle,
  onUploadBackgroundImage,
  variables
}: {
  parentElement?: DesignElement;
  selectedElement: DesignElement;
  onUpdate: (patch: Partial<DesignElement>) => void;
  onUpdateLayout: (patch: Partial<DesignLayout>) => void;
  onUpdateProps: (patch: Record<string, unknown>) => void;
  onUpdateStyle: (patch: Partial<DesignElementStyle>) => void;
  onUploadBackgroundImage: (file: File) => Promise<string>;
  variables: DesignVariables;
}) {
  return (
    <div data-property-inspector="true" className="h-full min-h-0 max-xl:hidden">
      <CustomScrollbar className="h-full min-h-0 border-l border-[#d9e1e8] bg-white" variant="slate">
        <div className="p-3.5">
          <div className="text-sm font-bold">Properties</div>
          <p className="mt-1 text-xs leading-5 text-[#5b6472]">Selected: {selectedElement.name}</p>

          <div className="mt-4 space-y-4">
            <TypeSpecificFields selectedElement={selectedElement} onUpdateProps={onUpdateProps} onUpdateStyle={onUpdateStyle} variables={variables} />
            <FlexLayoutFields selectedElement={selectedElement} parentElement={parentElement} onUpdateLayout={onUpdateLayout} />
            <StyleFields selectedElement={selectedElement} onUpdateStyle={onUpdateStyle} onUploadBackgroundImage={onUploadBackgroundImage} />
            <PropertyGroup title="Basics">
              <FieldLabel>Node name</FieldLabel>
              <Input value={selectedElement.name} className="mt-1 h-9" onChange={(event) => onUpdate({ name: event.target.value })} />
              <FieldLabel className="mt-3">Material type</FieldLabel>
              <Input value={selectedElement.type} readOnly className="mt-1 h-9 font-mono" />
            </PropertyGroup>
          </div>
        </div>
      </CustomScrollbar>
    </div>
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

function StyleFields({
  onUpdateStyle,
  onUploadBackgroundImage,
  selectedElement
}: {
  selectedElement: DesignElement;
  onUpdateStyle: (patch: Partial<DesignElementStyle>) => void;
  onUploadBackgroundImage: (file: File) => Promise<string>;
}) {
  const base = selectedElement.style.base;
  const showTypographyControls = selectedElement.type === "text";
  const showTextAlignControl = selectedElement.type === "text" || selectedElement.type === "stat";
  return (
    <PropertyGroup title="Base style">
      <ColorSwatchControl label="Background color" value={base.backgroundColor} onChange={(backgroundColor) => onUpdateStyle({ base: { backgroundColor } } as Partial<DesignElementStyle>)} />
      <BackgroundImageControl
        value={base.backgroundImage ?? ""}
        onChange={(backgroundImage) => onUpdateStyle({ base: { backgroundImage: backgroundImage || undefined } } as Partial<DesignElementStyle>)}
        onUpload={async (file) => {
          const backgroundImage = await onUploadBackgroundImage(file);
          onUpdateStyle({ base: { backgroundImage } } as Partial<DesignElementStyle>);
        }}
      />
      <VisualTokenControl label="Radius" value={base.radius} options={radiusOptions} variant="radius" onChange={(radius) => onUpdateStyle({ base: { radius } } as Partial<DesignElementStyle>)} />
      <VisualTokenControl label="Border width" value={base.border.width} options={borderWidthOptions} variant="border" onChange={(width) => onUpdateStyle({ base: { border: { width } } } as Partial<DesignElementStyle>)} />
      <SelectControl label="Border style" value={base.border.style} options={["solid", "dashed", "none"]} onChange={(style) => onUpdateStyle({ base: { border: { style } } } as Partial<DesignElementStyle>)} />
      <ColorSwatchControl label="Border color" value={base.border.color} onChange={(color) => onUpdateStyle({ base: { border: { color } } } as Partial<DesignElementStyle>)} />
      {showTypographyControls ? (
        <>
          <ColorSwatchControl label="Text color" value={base.text.color} onChange={(color) => onUpdateStyle({ base: { text: { color } } } as Partial<DesignElementStyle>)} />
          <VisualTokenControl label="Font size" value={base.text.fontSize} options={fontSizeOptions} variant="textSize" onChange={(fontSize) => onUpdateStyle({ base: { text: { fontSize } } } as Partial<DesignElementStyle>)} />
          <VisualTokenControl label="Font weight" value={base.text.fontWeight} options={fontWeightOptions} variant="weight" onChange={(fontWeight) => onUpdateStyle({ base: { text: { fontWeight } } } as Partial<DesignElementStyle>)} />
        </>
      ) : null}
      {showTextAlignControl ? <TextAlignControl value={base.text.align} onChange={(align) => onUpdateStyle({ base: { text: { align } } } as Partial<DesignElementStyle>)} /> : null}
    </PropertyGroup>
  );
}

function TypeSpecificFields({
  selectedElement,
  onUpdateProps,
  onUpdateStyle,
  variables
}: {
  selectedElement: DesignElement;
  onUpdateProps: (patch: Record<string, unknown>) => void;
  onUpdateStyle: (patch: Partial<DesignElementStyle>) => void;
  variables: DesignVariables;
}) {
  if (selectedElement.type === "text") {
    return (
      <>
        <PropertyGroup title="Text">
          <FieldLabel>Content</FieldLabel>
          <VariableTextEditor ariaLabel="Content" value={String(selectedElement.props?.text ?? "")} variables={variables} onChange={(value) => onUpdateProps({ text: value })} />
        </PropertyGroup>
        <PropertyGroup title="Text style">
          <SegmentedControl label="Text role" value={selectedElement.style.text.role} options={toOptions(["heading", "subheading", "body", "caption"])} onChange={(role) => onUpdateStyle({ text: { role } } as Partial<DesignElementStyle>)} />
          <SegmentedControl label="Decoration" value={selectedElement.style.text.decoration} options={toOptions(["none", "underline", "lineThrough"])} onChange={(decoration) => onUpdateStyle({ text: { decoration } } as Partial<DesignElementStyle>)} />
          <SegmentedControl label="Transform" value={selectedElement.style.text.transform} options={toOptions(["none", "uppercase", "lowercase", "capitalize"])} onChange={(transform) => onUpdateStyle({ text: { transform } } as Partial<DesignElementStyle>)} />
        </PropertyGroup>
      </>
    );
  }

  if (selectedElement.type === "button") {
    return (
      <>
        <PropertyGroup title="Button">
          <FieldLabel>Label</FieldLabel>
          <VariableTextEditor ariaLabel="Button label" value={String(selectedElement.props?.label ?? "")} variables={variables} onChange={(value) => onUpdateProps({ label: value })} />
          <SelectControl label="Action" value={String(selectedElement.props?.action ?? "platformApi")} options={["openForm", "platformApi", "ai", "mcp"]} onChange={(value) => onUpdateProps({ action: value })} />
        </PropertyGroup>
        <PropertyGroup title="Button style">
          <SegmentedControl label="Button size" value={selectedElement.style.button.size} options={toOptions(["sm", "md", "lg"])} onChange={(size) => onUpdateStyle({ button: { size } } as Partial<DesignElementStyle>)} />
          <SegmentedControl label="Button emphasis" value={selectedElement.style.button.emphasis} options={toOptions(["primary", "secondary", "ghost"])} onChange={(emphasis) => onUpdateStyle({ button: { emphasis } } as Partial<DesignElementStyle>)} />
        </PropertyGroup>
      </>
    );
  }

  if (selectedElement.type === "image") {
    return (
      <>
        <PropertyGroup title="Image">
          <FieldLabel>Alt text</FieldLabel>
          <VariableTextEditor ariaLabel="Image alt text" value={String(selectedElement.props?.alt ?? "")} variables={variables} onChange={(value) => onUpdateProps({ alt: value })} />
        </PropertyGroup>
        <PropertyGroup title="Image style">
          <VisualTokenControl label="Aspect ratio" value={selectedElement.style.image.aspectRatio} options={toOptions(["wide", "square", "portrait"])} variant="aspect" onChange={(aspectRatio) => onUpdateStyle({ image: { aspectRatio } } as Partial<DesignElementStyle>)} />
          <SegmentedControl label="Object fit" value={selectedElement.style.image.objectFit} options={toOptions(["cover", "contain", "fill"])} onChange={(objectFit) => onUpdateStyle({ image: { objectFit } } as Partial<DesignElementStyle>)} />
        </PropertyGroup>
      </>
    );
  }

  if (selectedElement.type === "input") {
    return (
      <>
        <PropertyGroup title="Input">
          <FieldLabel>Label</FieldLabel>
          <VariableTextEditor ariaLabel="Input label" value={String(selectedElement.props?.label ?? "")} variables={variables} onChange={(value) => onUpdateProps({ label: value })} />
          <FieldLabel>Placeholder</FieldLabel>
          <VariableTextEditor ariaLabel="Input placeholder" value={String(selectedElement.props?.placeholder ?? "")} variables={variables} onChange={(value) => onUpdateProps({ placeholder: value })} />
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
          <VariableTextEditor ariaLabel="Badge label" value={String(selectedElement.props?.label ?? "")} variables={variables} onChange={(value) => onUpdateProps({ label: value })} />
        </PropertyGroup>
        <PropertyGroup title="Badge style">
          <SegmentedControl label="Badge size" value={selectedElement.style.badge.size} options={toOptions(["sm", "md", "lg"])} onChange={(size) => onUpdateStyle({ badge: { size } } as Partial<DesignElementStyle>)} />
          <SegmentedControl label="Badge shape" value={selectedElement.style.badge.shape} options={toOptions(["square", "pill"])} onChange={(shape) => onUpdateStyle({ badge: { shape } } as Partial<DesignElementStyle>)} />
          <SegmentedControl label="Badge emphasis" value={selectedElement.style.badge.emphasis} options={toOptions(["soft", "solid", "outline"])} onChange={(emphasis) => onUpdateStyle({ badge: { emphasis } } as Partial<DesignElementStyle>)} />
        </PropertyGroup>
      </>
    );
  }

  if (selectedElement.type === "divider") {
    return (
      <>
        <PropertyGroup title="Divider">
          <FieldLabel>Label</FieldLabel>
          <VariableTextEditor ariaLabel="Divider label" value={String(selectedElement.props?.label ?? "")} variables={variables} onChange={(value) => onUpdateProps({ label: value })} />
        </PropertyGroup>
        <PropertyGroup title="Divider style">
          <SegmentedControl label="Divider direction" value={selectedElement.style.divider.direction} options={toOptions(["horizontal", "vertical"])} onChange={(direction) => onUpdateStyle({ divider: { direction } } as Partial<DesignElementStyle>)} />
          <VisualTokenControl label="Divider thickness" value={selectedElement.style.divider.thickness} options={toOptions(["sm", "md", "lg"])} variant="border" onChange={(thickness) => onUpdateStyle({ divider: { thickness } } as Partial<DesignElementStyle>)} />
          <SegmentedControl label="Divider label position" value={selectedElement.style.divider.labelPosition} options={toOptions(["start", "center", "end"])} onChange={(labelPosition) => onUpdateStyle({ divider: { labelPosition } } as Partial<DesignElementStyle>)} />
        </PropertyGroup>
      </>
    );
  }

  if (selectedElement.type === "table") {
    return (
      <>
        <FieldMultiSelect title="Table columns" value={arrayProp(selectedElement.props?.columns)} onChange={(columns) => onUpdateProps({ columns })} />
        <PropertyGroup title="Table style">
          <SegmentedControl label="Table density" value={selectedElement.style.table.density} options={toOptions(["compact", "default", "comfortable"])} onChange={(density) => onUpdateStyle({ table: { density } } as Partial<DesignElementStyle>)} />
          <ColorSwatchControl label="Header background" value={selectedElement.style.table.headerBackground} onChange={(headerBackground) => onUpdateStyle({ table: { headerBackground } } as Partial<DesignElementStyle>)} />
          <SegmentedControl label="Border mode" value={selectedElement.style.table.borderMode} options={toOptions(["none", "rows", "grid"])} onChange={(borderMode) => onUpdateStyle({ table: { borderMode } } as Partial<DesignElementStyle>)} />
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
          <SegmentedControl label="Submit mode" value={String(selectedElement.props?.mode ?? "drawer")} options={toOptions(["drawer", "inline", "modal"])} onChange={(value) => onUpdateProps({ mode: value })} />
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
          <VariableTextEditor ariaLabel="Stat label" value={String(selectedElement.props?.label ?? "")} variables={variables} onChange={(value) => onUpdateProps({ label: value })} />
          <FieldLabel>Value</FieldLabel>
          <VariableTextEditor ariaLabel="Stat value" value={String(selectedElement.props?.value ?? "")} variables={variables} onChange={(value) => onUpdateProps({ value })} />
          <FieldLabel>Delta</FieldLabel>
          <VariableTextEditor ariaLabel="Stat delta" value={String(selectedElement.props?.delta ?? "")} variables={variables} onChange={(value) => onUpdateProps({ delta: value })} />
        </PropertyGroup>
        <PropertyGroup title="Stat style">
          <VisualTokenControl label="Value size" value={selectedElement.style.stat.valueSize} options={toOptions(["md", "lg", "xl"])} variant="textSize" onChange={(valueSize) => onUpdateStyle({ stat: { valueSize } } as Partial<DesignElementStyle>)} />
          <SegmentedControl label="Trend position" value={selectedElement.style.stat.trendPosition} options={toOptions(["inline", "below"])} onChange={(trendPosition) => onUpdateStyle({ stat: { trendPosition } } as Partial<DesignElementStyle>)} />
        </PropertyGroup>
      </>
    );
  }

  if (selectedElement.type === "page" || selectedElement.type === "section" || selectedElement.type === "stack") {
    return (
      <PropertyGroup title="Container style">
        <VisualTokenControl label="Shadow" value={selectedElement.style.container.shadow} options={toOptions(["none", "sm", "md", "lg"])} variant="shadow" onChange={(shadow) => onUpdateStyle({ container: { shadow } } as Partial<DesignElementStyle>)} />
        <SegmentedControl label="Overflow" value={selectedElement.style.container.overflow} options={toOptions(["visible", "hidden", "auto"])} onChange={(overflow) => onUpdateStyle({ container: { overflow } } as Partial<DesignElementStyle>)} />
        <SegmentedControl label="Surface" value={selectedElement.style.container.surface} options={toOptions(["flat", "card", "panel"])} onChange={(surface) => onUpdateStyle({ container: { surface } } as Partial<DesignElementStyle>)} />
      </PropertyGroup>
    );
  }

  return null;
}

function ControlStyleFields({ style, onUpdateStyle }: { style: Extract<DesignElementStyle, { control: unknown }>; onUpdateStyle: (patch: Partial<DesignElementStyle>) => void }) {
  return (
    <PropertyGroup title="Control style">
      <SegmentedControl label="Control size" value={style.control.size} options={toOptions(["sm", "md", "lg"])} onChange={(size) => onUpdateStyle({ control: { size } } as Partial<DesignElementStyle>)} />
      <SegmentedControl label="Label position" value={style.control.labelPosition} options={toOptions(["top", "left", "hidden"])} onChange={(labelPosition) => onUpdateStyle({ control: { labelPosition } } as Partial<DesignElementStyle>)} />
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
      {layout.width === "fixed" ? <DimensionControl axis="width" label="Fixed width value" max={960} min={120} value={layout.fixedWidth ?? 320} onChange={(fixedWidth) => onUpdateLayout({ fixedWidth })} /> : null}
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
      {layout.height === "fixed" ? <DimensionControl axis="height" label="Fixed height value" max={640} min={48} value={layout.fixedHeight ?? 160} onChange={(fixedHeight) => onUpdateLayout({ fixedHeight })} /> : null}
    </>
  );
}

function FieldMultiSelect({ onChange, title, value }: { onChange: (fields: string[]) => void; title: string; value: string[] }) {
  return (
    <PropertyGroup title={title}>
      <div className="flex flex-wrap gap-2">
        {availableFields.map((field) => (
          <button
            key={field}
            type="button"
            aria-pressed={value.includes(field)}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
              value.includes(field)
                ? "border-[#0f766e] bg-[#e8f4f2] text-[#0f766e] shadow-sm"
                : "border-[#d9e1e8] bg-white text-[#5b6472] hover:border-[#9cc8c2] hover:bg-[#f8fafb]"
            }`}
            onClick={() => {
              const next = value.includes(field) ? value.filter((item) => item !== field) : [...value, field];
              onChange(next);
            }}
          >
            {fieldLabels[field] ?? field}
          </button>
        ))}
      </div>
      <div className="mt-2 rounded-md bg-[#f8fafb] px-2.5 py-2 font-mono text-[11px] leading-4 text-[#8a94a3]">
        {value.length ? value.join(", ") : "No fields selected"}
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
      <div className="mt-1 grid gap-1 rounded-md bg-[#eef2f5] p-1" style={{ gridTemplateColumns: `repeat(${Math.min(options.length, 3)}, minmax(0, 1fr))` }}>
        {options.map((option) => {
          const active = option.value === value;
          return (
            <button
              key={option.value}
              aria-label={option.label}
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
    <label className="flex items-center justify-between rounded-md border border-[#d9e1e8] bg-white px-3 py-2 text-sm">
      <span className="font-semibold text-[#5b6472]">{label}</span>
      <span className={`relative h-5 w-9 rounded-full transition ${checked ? "bg-[#0f766e]" : "bg-[#cbd5df]"}`}>
        <input className="peer sr-only" type="checkbox" checked={checked} aria-label={label} onChange={(event) => onChange(event.target.checked)} />
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition ${checked ? "left-[18px]" : "left-0.5"}`} />
      </span>
    </label>
  );
}

function DimensionControl({
  axis,
  label,
  max,
  min,
  onChange,
  value
}: {
  axis: "width" | "height";
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  value: number;
}) {
  const clampedValue = clampNumber(value, min, max);
  const percent = ((clampedValue - min) / (max - min)) * 100;
  const previewStyle = axis === "width" ? { width: `${Math.max(18, percent)}%`, height: 16 } : { width: 28, height: `${Math.max(18, percent)}%` };

  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <div className="mt-1 rounded-md border border-[#d9e1e8] bg-white p-2.5">
        <div className="flex items-center gap-3">
          <input
            aria-label={`${label} slider`}
            className="h-2 min-w-0 flex-1 accent-[#0f766e]"
            max={max}
            min={min}
            step={axis === "width" ? 10 : 8}
            type="range"
            value={clampedValue}
            onChange={(event) => onChange(Number(event.target.value))}
          />
          <input
            aria-label={label}
            className="h-8 w-16 rounded-md border border-[#d9e1e8] bg-[#f8fafb] px-2 text-right text-xs font-semibold text-[#344054]"
            min={min}
            max={max}
            type="number"
            value={value}
            onChange={(event) => {
              const next = Number(event.target.value);
              if (Number.isFinite(next) && next > 0) onChange(Math.round(next));
            }}
          />
        </div>
        <div className={`mt-2 flex h-9 rounded bg-[#f8fafb] p-1 ${axis === "width" ? "items-center" : "items-end justify-center"}`} aria-hidden="true">
          <div className="rounded bg-[#0f766e]" style={previewStyle} />
        </div>
      </div>
    </div>
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

function ColorSwatchControl({ label, onChange, value }: { label: string; onChange: (value: string) => void; value: string }) {
  const [open, setOpen] = useState(false);
  const current = colorMeta[value] ?? { label: value, value };

  return (
    <div className="relative">
      <FieldLabel>{label}</FieldLabel>
      <button
        type="button"
        aria-expanded={open}
        aria-label={`Choose ${label}: ${current.label}`}
        className="mt-1 flex h-9 w-full items-center justify-between gap-2 rounded-md border border-[#d9e1e8] bg-white px-2.5 text-left text-xs font-semibold text-[#344054] transition hover:border-[#9cc8c2] hover:bg-[#f8fafb]"
        onClick={() => setOpen((next) => !next)}
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="h-5 w-5 shrink-0 rounded border border-[#cbd5df]" style={{ background: current.value }} />
          <span className="truncate">{current.label}</span>
        </span>
        <span className="text-[11px] font-semibold text-[#8a94a3]">{open ? "Close" : "Change"}</span>
      </button>
      {open ? (
        <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 rounded-lg border border-[#d9e1e8] bg-white p-2 shadow-xl shadow-slate-900/10">
          <div className="grid grid-cols-4 gap-1.5">
            {colorOptions.map((option) => {
              const meta = colorMeta[option] ?? { label: option, value: option };
              const active = option === value;
              return (
                <button
                  key={option}
                  type="button"
                  aria-label={`${label}: ${meta.label}`}
                  aria-pressed={active}
                  title={meta.label}
                  className={`grid h-9 place-items-center rounded-md border text-[10px] font-bold transition ${
                    active ? "border-[#0f766e] ring-2 ring-[#0f766e]/20" : "border-[#d9e1e8] hover:border-[#9cc8c2]"
                  }`}
                  style={{ background: meta.value, color: meta.text }}
                  onClick={() => {
                    onChange(option);
                    setOpen(false);
                  }}
                >
                  {active ? "On" : ""}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function BackgroundImageControl({ onChange, onUpload, value }: { onChange: (value: string) => void; onUpload: (file: File) => Promise<void>; value: string }) {
  const [uploadState, setUploadState] = useState<"idle" | "uploading" | "error">("idle");
  const [uploadError, setUploadError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const trimmedValue = value.trim();
  return (
    <div>
      <FieldLabel>Background image URL</FieldLabel>
      <Input
        aria-label="Background image URL"
        className="mt-1 h-9 text-xs"
        placeholder="https://bucket.oss-cn-hangzhou.aliyuncs.com/bg.png"
        value={value}
        onChange={(event) => onChange(event.target.value.trim())}
      />
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          className={`inline-flex h-8 cursor-pointer items-center rounded-md border px-3 text-xs font-semibold transition ${uploadState === "uploading" ? "border-[#d9e1e8] bg-[#f8fafb] text-[#8a94a3]" : "border-[#cbd5df] bg-white text-[#5b6472] hover:bg-[#f8fafb]"}`}
          disabled={uploadState === "uploading"}
          onClick={() => {
            clearDropPlacementIndicator();
            fileInputRef.current?.click();
          }}
          onPointerDown={clearDropPlacementIndicator}
        >
          {uploadState === "uploading" ? "Uploading..." : "Upload file"}
        </button>
        <input
          ref={fileInputRef}
          aria-label="Upload background image"
          className="hidden"
          type="file"
          accept="image/*"
          disabled={uploadState === "uploading"}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.currentTarget.value = "";
            if (!file) return;
            setUploadError("");
            setUploadState("uploading");
            void onUpload(file)
              .then(() => setUploadState("idle"))
              .catch((error: unknown) => {
                setUploadError(error instanceof Error ? error.message : "Unknown upload error");
                setUploadState("error");
              });
          }}
        />
        {trimmedValue ? (
          <button className="h-8 rounded-md px-2 text-xs font-semibold text-[#8a94a3] hover:bg-[#eef2f5]" type="button" onClick={() => onChange("")}>
            Clear
          </button>
        ) : null}
      </div>
      {uploadState === "error" ? <div className="mt-1 text-[11px] font-medium text-[#dc2626]">Upload failed: {uploadError || "check OSS config and try again."}</div> : null}
      <div className="mt-2 overflow-hidden rounded-md border border-[#d9e1e8] bg-[#f8fafb]">
        {trimmedValue ? (
          <div className="h-16 bg-cover bg-center" style={{ backgroundImage: cssUrl(trimmedValue) }} />
        ) : (
          <div className="grid h-12 place-items-center px-2 text-center text-[11px] font-medium text-[#8a94a3]">
            Paste an OSS or CDN image URL
          </div>
        )}
      </div>
    </div>
  );
}

function VisualTokenControl<T extends string>({
  label,
  onChange,
  options,
  value,
  variant
}: {
  label: string;
  onChange: (value: T) => void;
  options: LayoutOption<T>[];
  value: T;
  variant: "radius" | "border" | "textSize" | "weight" | "aspect" | "shadow";
}) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <div className="mt-1 grid gap-1.5" style={{ gridTemplateColumns: `repeat(${Math.min(options.length, 4)}, minmax(0, 1fr))` }}>
        {options.map((option) => {
          const active = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              aria-label={`${label}: ${option.label}`}
              aria-pressed={active}
              className={`min-h-12 rounded-md border bg-white px-2 py-1.5 text-xs font-semibold transition ${
                active ? "border-[#0f766e] text-[#0f766e] shadow-sm ring-1 ring-[#0f766e]/20" : "border-[#d9e1e8] text-[#5b6472] hover:border-[#9cc8c2]"
              }`}
              onClick={() => onChange(option.value)}
            >
              <span className="flex h-6 items-center justify-center">{tokenPreview(option.value, variant)}</span>
              <span className="block truncate">{option.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TextAlignControl({ onChange, value }: { onChange: (value: "left" | "center" | "right") => void; value: "left" | "center" | "right" }) {
  const options = [
    { value: "left" as const, label: "Left", icon: AlignLeft },
    { value: "center" as const, label: "Center", icon: AlignCenter },
    { value: "right" as const, label: "Right", icon: AlignRight }
  ];
  return (
    <div>
      <FieldLabel>Text align</FieldLabel>
      <div className="mt-1 grid grid-cols-3 gap-1 rounded-md bg-[#eef2f5] p-1">
        {options.map((option) => {
          const Icon = option.icon;
          const active = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              aria-label={`Text align: ${option.label}`}
              aria-pressed={active}
              className={`grid h-9 place-items-center rounded transition ${active ? "bg-white text-[#0f766e] shadow-sm" : "text-[#5b6472] hover:bg-white/70"}`}
              title={option.label}
              onClick={() => onChange(option.value)}
            >
              <Icon size={16} />
            </button>
          );
        })}
      </div>
    </div>
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

function tokenPreview(value: string, variant: "radius" | "border" | "textSize" | "weight" | "aspect" | "shadow") {
  if (variant === "radius") {
    return <span className="block h-5 w-8 border border-[#0f766e] bg-[#e8f4f2]" style={{ borderRadius: radiusPreviewValue(value) }} />;
  }
  if (variant === "border") {
    return <span className="block w-9 border-t border-[#0f766e]" style={{ borderTopWidth: borderPreviewValue(value), borderTopStyle: value === "none" ? "dashed" : "solid", opacity: value === "none" ? 0.4 : 1 }} />;
  }
  if (variant === "textSize") {
    return <span className="font-bold leading-none text-[#0f766e]" style={{ fontSize: textSizePreviewValue(value) }}>Aa</span>;
  }
  if (variant === "weight") {
    return <span className="text-sm leading-none text-[#0f766e]" style={{ fontWeight: weightPreviewValue(value) }}>Aa</span>;
  }
  if (variant === "aspect") {
    return <span className="block border border-[#0f766e] bg-[#e8f4f2]" style={aspectPreviewStyle(value)} />;
  }
  return <span className="block h-5 w-8 rounded border border-[#d9e1e8] bg-white" style={{ boxShadow: shadowPreviewValue(value) }} />;
}

function toOptions<T extends string>(values: T[]): LayoutOption<T>[] {
  return values.map((value) => ({ value, label: labelize(value) }));
}

function labelize(value: string) {
  return value.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^\w/, (letter) => letter.toUpperCase());
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function radiusPreviewValue(value: string) {
  const radii: Record<string, string> = { none: "0", xs: "2px", sm: "4px", md: "6px", lg: "8px", xl: "12px", full: "999px" };
  return radii[value] ?? radii.md;
}

function borderPreviewValue(value: string) {
  if (value === "sm") return 1;
  if (value === "md") return 2;
  if (value === "lg") return 3;
  return 1;
}

function textSizePreviewValue(value: string) {
  const sizes: Record<string, string> = { xs: "11px", sm: "12px", md: "14px", lg: "15px", xl: "17px", "2xl": "19px", "3xl": "21px" };
  return sizes[value] ?? sizes.md;
}

function weightPreviewValue(value: string) {
  if (value === "medium") return 500;
  if (value === "semibold") return 600;
  if (value === "bold") return 700;
  return 400;
}

function aspectPreviewStyle(value: string) {
  if (value === "square") return { width: 22, height: 22 };
  if (value === "portrait") return { width: 18, height: 26 };
  return { width: 34, height: 16 };
}

function shadowPreviewValue(value: string) {
  if (value === "sm") return "0 2px 4px rgba(16, 24, 40, 0.15)";
  if (value === "md") return "0 5px 10px rgba(16, 24, 40, 0.18)";
  if (value === "lg") return "0 9px 16px rgba(16, 24, 40, 0.2)";
  return "none";
}

function cssUrl(value: string) {
  return `url(${JSON.stringify(value)})`;
}

function arrayProp(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}
