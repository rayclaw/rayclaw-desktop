import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { AppStatus, ConfigDto, ChatSummary, StoredMessage, AgentStreamEvent, ChannelStatus, SoulDto, SkillDto, SkillDetailDto, MemoryDto, MemoryObservabilityDto, UsageSummaryDto, ModelUsageDto, ScheduledTaskDto, TaskRunLogDto, TasksSummaryDto, DbStatsDto, DashboardTasksResult, DashboardMemoriesResult } from "../types";

export async function getStatus(): Promise<AppStatus> {
  return invoke("get_status");
}

export async function getConfig(): Promise<ConfigDto> {
  return invoke("get_config");
}

export async function saveConfig(config: ConfigDto): Promise<void> {
  return invoke("save_config", { config });
}

export async function getChannelStatus(): Promise<ChannelStatus[]> {
  return invoke("get_channel_status");
}

export async function toggleChannel(name: string, enabled: boolean): Promise<void> {
  return invoke("toggle_channel", { name, enabled });
}

export interface Attachment {
  data: string;       // base64-encoded (no data URI prefix)
  media_type: string; // e.g. "image/png"
  name: string;
}

export async function sendMessage(chatId: number, content: string, attachments?: Attachment[]): Promise<void> {
  return invoke("send_message", {
    chatId,
    content,
    attachments: attachments && attachments.length > 0 ? attachments : null,
  });
}

export async function getHistory(chatId: number, limit?: number): Promise<StoredMessage[]> {
  return invoke("get_history", { chatId, limit: limit ?? 100 });
}

export async function getChats(): Promise<ChatSummary[]> {
  return invoke("get_chats");
}

export async function resetSession(chatId: number): Promise<void> {
  return invoke("reset_session", { chatId });
}

export async function newChat(): Promise<number> {
  return invoke("new_chat");
}

export async function renameChat(chatId: number, title: string): Promise<void> {
  return invoke("rename_chat", { chatId, title });
}

export async function deleteChat(chatId: number): Promise<void> {
  return invoke("delete_chat", { chatId });
}

export async function exportChatMarkdown(chatId: number): Promise<string> {
  return invoke("export_chat_markdown", { chatId });
}

export function onAgentStream(callback: (event: AgentStreamEvent) => void): Promise<UnlistenFn> {
  return listen<AgentStreamEvent>("agent-stream", (e) => callback(e.payload));
}

// SOUL.md
export async function readSoul(chatId?: number): Promise<SoulDto> {
  return invoke("read_soul", { chatId: chatId ?? null });
}

export async function saveSoul(content: string, chatId?: number): Promise<void> {
  return invoke("save_soul", { chatId: chatId ?? null, content });
}

// Skills
export async function listSkills(): Promise<SkillDto[]> {
  return invoke("list_skills");
}

export async function getSkill(name: string): Promise<SkillDetailDto> {
  return invoke("get_skill", { name });
}

export async function saveSkill(
  name: string,
  description: string,
  platforms: string[],
  deps: string[],
  content: string,
): Promise<void> {
  return invoke("save_skill", { name, description, platforms, deps, content });
}

export async function deleteSkill(name: string): Promise<void> {
  return invoke("delete_skill", { name });
}

// Memory Management
export async function listMemories(chatId?: number): Promise<MemoryDto[]> {
  return invoke("list_memories", { chatId: chatId ?? null });
}

export async function searchMemories(chatId: number, query: string, includeArchived: boolean): Promise<MemoryDto[]> {
  return invoke("search_memories", { chatId, query, includeArchived });
}

export async function updateMemory(id: number, content: string, category: string): Promise<boolean> {
  return invoke("update_memory", { id, content, category });
}

export async function archiveMemory(id: number): Promise<boolean> {
  return invoke("archive_memory", { id });
}

export async function deleteMemory(id: number): Promise<boolean> {
  return invoke("delete_memory", { id });
}

export async function getMemoryObservability(chatId?: number): Promise<MemoryObservabilityDto> {
  return invoke("get_memory_observability", { chatId: chatId ?? null });
}

// Usage Analytics
export async function getUsageSummary(chatId?: number, since?: string): Promise<UsageSummaryDto> {
  return invoke("get_usage_summary", { chatId: chatId ?? null, since: since ?? null });
}

export async function getUsageByModel(chatId?: number, since?: string): Promise<ModelUsageDto[]> {
  return invoke("get_usage_by_model", { chatId: chatId ?? null, since: since ?? null });
}

// Scheduler
export async function listScheduledTasks(chatId: number): Promise<ScheduledTaskDto[]> {
  return invoke("list_scheduled_tasks", { chatId });
}

export async function updateTaskStatus(taskId: number, status: string): Promise<boolean> {
  return invoke("update_task_status", { taskId, status });
}

export async function deleteScheduledTask(taskId: number): Promise<boolean> {
  return invoke("delete_scheduled_task", { taskId });
}

export async function getTaskRunLogs(taskId: number): Promise<TaskRunLogDto[]> {
  return invoke("get_task_run_logs", { taskId });
}

// Dashboard
export async function getDashboardTasksSummary(): Promise<TasksSummaryDto> {
  return invoke("get_dashboard_tasks_summary");
}

export async function getDashboardTasks(
  status?: string,
  scheduleType?: string,
  limit?: number,
  offset?: number,
): Promise<DashboardTasksResult> {
  return invoke("get_dashboard_tasks", {
    status: status ?? null,
    scheduleType: scheduleType ?? null,
    limit: limit ?? 50,
    offset: offset ?? 0,
  });
}

export async function getDashboardMemories(
  chatId?: number | null,
  category?: string,
  search?: string,
  includeArchived?: boolean,
  limit?: number,
  offset?: number,
): Promise<DashboardMemoriesResult> {
  return invoke("get_dashboard_memories", {
    chatId: chatId ?? null,
    category: category ?? null,
    search: search ?? null,
    includeArchived: includeArchived ?? false,
    limit: limit ?? 50,
    offset: offset ?? 0,
  });
}

export async function getDbStats(): Promise<DbStatsDto> {
  return invoke("get_db_stats");
}
