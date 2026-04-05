import { useState, useCallback, useEffect } from "react";
import { getChats, listScheduledTasks, updateTaskStatus, deleteScheduledTask, getTaskRunLogs } from "../../lib/tauri-api";
import type { ChatSummary, ScheduledTaskDto, TaskRunLogDto } from "../../types";

export function useScheduler(active: boolean) {
  const [chatId, setChatId] = useState(0);
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [tasks, setTasks] = useState<ScheduledTaskDto[]>([]);
  const [logs, setLogs] = useState<TaskRunLogDto[]>([]);
  const [viewingTaskId, setViewingTaskId] = useState<number | null>(null);

  const fetchTasks = useCallback(() => {
    if (chatId > 0) {
      listScheduledTasks(chatId).then(setTasks).catch(() => {});
    } else {
      setTasks([]);
    }
  }, [chatId]);

  useEffect(() => {
    if (active) {
      getChats().then(setChats).catch(() => {});
      fetchTasks();
    }
  }, [active, fetchTasks]);

  const pause = async (id: number) => {
    await updateTaskStatus(id, "paused").catch(() => {});
    fetchTasks();
  };

  const resume = async (id: number) => {
    await updateTaskStatus(id, "active").catch(() => {});
    fetchTasks();
  };

  const cancel = async (id: number) => {
    if (!window.confirm("Cancel this scheduled task?")) return;
    await updateTaskStatus(id, "cancelled").catch(() => {});
    fetchTasks();
  };

  const remove = async (id: number) => {
    if (!window.confirm("Permanently delete this task?")) return;
    await deleteScheduledTask(id).catch(() => {});
    setViewingTaskId(null);
    fetchTasks();
  };

  const viewLogs = async (id: number) => {
    setViewingTaskId(id);
    const result = await getTaskRunLogs(id).catch(() => [] as TaskRunLogDto[]);
    setLogs(result);
  };

  const closeLogs = () => setViewingTaskId(null);

  return {
    chatId,
    setChatId,
    chats,
    tasks,
    logs,
    viewingTaskId,
    fetchTasks,
    pause,
    resume,
    cancel,
    remove,
    viewLogs,
    closeLogs,
  };
}
