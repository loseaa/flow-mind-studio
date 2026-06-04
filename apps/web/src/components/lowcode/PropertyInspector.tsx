import type { ReactNode } from "react";
import type { DesignAppearance, DesignElement, DesignLayout } from "@flowmind/shared";
import { Input } from "@flowmind/ui";
import { CustomScrollbar } from "../CustomScrollbar";
import { availableFields, fieldLabels } from "./lowcodeData";

export function PropertyInspector({
  selectedElement,
  onUpdate,
  onUpdateAppearance,
  onUpdateLayout,
  onUpdateProps
}: {
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

          <PropertyGroup title="布局">
            <SelectControl label="方向" value={selectedElement.layout?.direction ?? "vertical"} options={["vertical", "horizontal"]} onChange={(value) => onUpdateLayout({ direction: value as DesignLayout["direction"] })} />
            <SelectControl label="间距" value={selectedElement.layout?.gap ?? "md"} options={["none", "xs", "sm", "md", "lg", "xl"]} onChange={(value) => onUpdateLayout({ gap: value as DesignLayout["gap"] })} />
            <SelectControl label="内边距" value={selectedElement.layout?.padding ?? "none"} options={["none", "xs", "sm", "md", "lg", "xl"]} onChange={(value) => onUpdateLayout({ padding: value as DesignLayout["padding"] })} />
            <div className="rounded-md bg-[#f8fafb] p-2 text-xs leading-5 text-[#5b6472]">当前设计稿只支持 Flex 布局。</div>
          </PropertyGroup>

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
