import type { ConfigDto } from "../../types";

export interface ValidationErrors {
  [key: string]: string;
}

export function validate(config: ConfigDto): ValidationErrors {
  const errs: ValidationErrors = {};
  if (config.max_tokens < 1) errs.max_tokens = "Must be at least 1";
  if (config.max_tool_iterations < 1) errs.max_tool_iterations = "Must be at least 1";
  if (config.max_history_messages < 1) errs.max_history_messages = "Must be at least 1";
  if (config.max_session_messages < 1) errs.max_session_messages = "Must be at least 1";
  if (config.memory_token_budget < 1) errs.memory_token_budget = "Must be at least 1";
  if (config.llm_base_url && !/^https?:\/\/.+/.test(config.llm_base_url)) {
    errs.llm_base_url = "Must be a valid URL (http:// or https://)";
  }
  if (!config.data_dir.trim()) errs.data_dir = "Required";
  if (!config.working_dir.trim()) errs.working_dir = "Required";
  return errs;
}
