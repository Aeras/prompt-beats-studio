import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { getCurrentUserAiModelAccess } from "@/lib/ai.functions";
import { shouldShowAiModelSelector } from "@/lib/ai-model-selector-policy.shared";

type ModelBucket = "generator" | "qualityCheck" | "aiTools";
type ModelOption = {
  id: string;
  label: string;
  provider: string;
  reasoningEffort?: string | null;
};

type OptionsFilter = (option: ModelOption) => boolean;

export function useAiModelSelection(bucket: ModelBucket, filter?: OptionsFilter) {
  const access = useQuery({
    queryKey: ["my-ai-model-access"],
    queryFn: () => getCurrentUserAiModelAccess(),
  });

  const rawBucket = access.data?.[bucket];
  const options = useMemo(() => {
    const source = (rawBucket?.modelOptions ?? []) as ModelOption[];
    return filter ? source.filter(filter) : source;
  }, [rawBucket?.modelOptions, filter]);

  const eligibleDefault = options.some((option) => option.id === rawBucket?.defaultModel)
    ? (rawBucket?.defaultModel ?? "")
    : (options[0]?.id ?? "");
  const [selectedModel, setSelectedModel] = useState("");

  useEffect(() => {
    if (options.length === 0) {
      if (selectedModel) setSelectedModel("");
      return;
    }
    if (!options.some((option) => option.id === selectedModel)) {
      setSelectedModel(eligibleDefault);
    }
  }, [eligibleDefault, options, selectedModel]);

  return {
    access,
    options,
    selectedModel,
    setSelectedModel,
    showSelector: shouldShowAiModelSelector(options.length),
    unavailable: access.isSuccess && options.length === 0,
  };
}
