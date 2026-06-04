import { useEffect, useState } from "react";
import type { DataModel } from "@flowmind/shared";
import { Badge, Card } from "@flowmind/ui";
import { PageHeader } from "../../components/PageHeader";
import { apiGet, fallbackModels } from "../../api";

export function DataModelsPage() {
  const [models, setModels] = useState<DataModel[]>(fallbackModels);

  useEffect(() => {
    void apiGet("/data-models", fallbackModels).then(setModels);
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader title="数据模型" text="低代码页面第一版只绑定平台内置数据模型，后续再扩展外部 REST API 数据源。" />
      <div className="grid gap-4 md:grid-cols-2">
        {models.map((model) => (
          <Card key={model.id} className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold">{model.label}</h3>
                <div className="font-mono text-sm text-slate-500">{model.name}</div>
              </div>
              <Badge>{model.fields.length} 字段</Badge>
            </div>
            <div className="mt-4 space-y-2">
              {model.fields.map((field) => (
                <div key={field.id} className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2 text-sm">
                  <span>{field.label}</span>
                  <span className="font-mono text-slate-500">{field.type}</span>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
