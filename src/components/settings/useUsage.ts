import { useState, useCallback, useEffect } from "react";
import { getUsageSummary, getUsageByModel } from "../../lib/tauri-api";
import type { UsageSummaryDto, ModelUsageDto } from "../../types";

export function useUsage(active: boolean) {
  const [summary, setSummary] = useState<UsageSummaryDto | null>(null);
  const [models, setModels] = useState<ModelUsageDto[]>([]);
  const [range, setRange] = useState("all");
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(() => {
    setError(null);
    let since: string | undefined;
    const now = new Date();
    if (range === "today") {
      since = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    } else if (range === "7d") {
      since = new Date(now.getTime() - 7 * 86400000).toISOString();
    } else if (range === "30d") {
      since = new Date(now.getTime() - 30 * 86400000).toISOString();
    }
    getUsageSummary(undefined, since).then(setSummary).catch((e) => setError(String(e)));
    getUsageByModel(undefined, since).then(setModels).catch(() => {});
  }, [range]);

  useEffect(() => {
    if (active) fetch();
  }, [active, fetch]);

  return { summary, models, range, setRange, error };
}
