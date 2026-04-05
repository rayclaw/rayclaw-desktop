export interface AppStatus {
  ready: boolean;
  error: string | null;
}

export interface ConfigDto {
  llm_provider: string;
  api_key: string;
  model: string;
  llm_base_url: string | null;
  max_tokens: number;
  show_thinking: boolean;
  // AWS Bedrock
  aws_region: string | null;
  aws_access_key_id: string | null;
  aws_secret_access_key: string | null;
  aws_profile: string | null;
  // Session
  max_tool_iterations: number;
  max_history_messages: number;
  max_session_messages: number;
  // Paths
  data_dir: string;
  working_dir: string;
  timezone: string;
  // Advanced
  skip_tool_approval: boolean;
  soul_path: string | null;
  memory_token_budget: number;
  reflector_enabled: boolean;
  // Channels — Telegram
  telegram_bot_token: string;
  bot_username: string;
  // Channels — Discord
  discord_bot_token: string | null;
  // Channels — Slack
  slack_bot_token: string | null;
  slack_app_token: string | null;
  // Channels — Feishu
  feishu_app_id: string | null;
  feishu_app_secret: string | null;
  // Channels — Web
  web_enabled: boolean;
}

export interface ChatSummary {
  chat_id: number;
  chat_title: string | null;
  chat_type: string;
  last_message_time: string;
  last_message_preview: string | null;
}

export interface StoredMessage {
  id: string;
  chat_id: number;
  sender_name: string;
  content: string;
  is_from_bot: boolean;
  timestamp: string;
}

export interface ChannelStatus {
  name: string;
  configured: boolean;
  enabled: boolean;
  running: boolean;
}

export function inferChannel(chatType: string): string {
  switch (chatType) {
    case "private":
    case "group":
    case "supergroup":
    case "channel":
      return "telegram";
    case "discord":
      return "discord";
    case "slack":
    case "slack_dm":
      return "slack";
    case "feishu_dm":
    case "feishu_group":
      return "feishu";
    case "web":
      return "web";
    case "desktop":
      return "desktop";
    default:
      return "unknown";
  }
}

export function channelLabel(chatType: string): string | null {
  const ch = inferChannel(chatType);
  switch (ch) {
    case "telegram":
      return "TG";
    case "discord":
      return "DC";
    case "slack":
      return "Slack";
    case "feishu":
      return "Feishu";
    case "web":
      return "Web";
    default:
      return null;
  }
}

export interface SoulDto {
  content: string;
  path: string;
  exists: boolean;
}

export interface SkillDto {
  name: string;
  description: string;
  platforms: string[];
  deps: string[];
  source: string;
  version: string | null;
  updated_at: string | null;
  available: boolean;
  unavailable_reason: string | null;
}

export interface SkillDetailDto {
  meta: SkillDto;
  content: string;
}

// Memory
export interface MemoryDto {
  id: number;
  chat_id: number | null;
  content: string;
  category: string;
  confidence: number;
  source: string;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface MemoryObservabilityDto {
  total: number;
  active: number;
  archived: number;
  low_confidence: number;
  avg_confidence: number;
  reflector_runs_24h: number;
  reflector_inserted_24h: number;
  reflector_updated_24h: number;
  reflector_skipped_24h: number;
  injection_events_24h: number;
  injection_selected_24h: number;
  injection_candidates_24h: number;
}

// Usage Analytics
export interface UsageSummaryDto {
  requests: number;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  last_request_at: string | null;
}

export interface ModelUsageDto {
  model: string;
  requests: number;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
}

// Scheduler
export interface ScheduledTaskDto {
  id: number;
  chat_id: number;
  prompt: string;
  schedule_type: string;
  schedule_value: string;
  next_run: string;
  last_run: string | null;
  status: string;
  created_at: string;
}

export interface TaskRunLogDto {
  id: number;
  task_id: number;
  chat_id: number;
  started_at: string;
  finished_at: string;
  duration_ms: number;
  success: boolean;
  result_summary: string | null;
}

// Dashboard
export interface TasksSummaryDto {
  total: number;
  active: number;
  paused: number;
  completed: number;
  cancelled: number;
  runs_24h: number;
  failures_24h: number;
}

export interface DbStatsDto {
  chats_count: number;
  messages_count: number;
  memories_count: number;
  tasks_count: number;
  db_size_bytes: number;
}

export interface DashboardMemoryDto {
  id: number;
  chat_id: number | null;
  content: string;
  category: string;
  confidence: number;
  source: string;
  created_at: string;
  updated_at: string;
  last_seen_at: string;
  is_archived: boolean;
  archived_at: string | null;
}

export interface DashboardTasksResult {
  total: number;
  tasks: ScheduledTaskDto[];
}

export interface DashboardMemoriesResult {
  total: number;
  memories: DashboardMemoryDto[];
}

// MCP Configuration
export interface McpServerConfig {
  transport: string;
  // stdio
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  // streamable_http
  endpoint?: string;
  headers?: Record<string, string>;
  // common optional
  protocol_version?: string | null;
  request_timeout_secs?: number | null;
  max_retries?: number | null;
  health_interval_secs?: number | null;
}

export interface McpConfigDto {
  default_protocol_version: string | null;
  mcp_servers: Record<string, McpServerConfig>;
}

export type AgentStreamEvent =
  | { type: "iteration"; chat_id: number; iteration: number }
  | { type: "tool_start"; chat_id: number; name: string }
  | { type: "tool_result"; chat_id: number; name: string; is_error: boolean; preview: string; duration_ms: number }
  | { type: "text_delta"; chat_id: number; delta: string }
  | { type: "final_response"; chat_id: number; text: string }
  | { type: "error"; chat_id: number; message: string };
