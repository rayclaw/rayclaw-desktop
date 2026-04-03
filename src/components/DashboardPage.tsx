import { useState, useEffect, useCallback } from "react";
import {
  getDashboardTasksSummary,
  getDashboardTasks,
  getDashboardMemories,
  getDbStats,
  getTaskRunLogs,
  getUsageSummary,
  getUsageByModel,
} from "../lib/tauri-api";
import type {
  TasksSummaryDto,
  DbStatsDto,
  ScheduledTaskDto,
  DashboardMemoryDto,
  TaskRunLogDto,
  UsageSummaryDto,
  ModelUsageDto,
} from "../types";

type DashboardTab = "overview" | "tasks" | "memories" | "usage";

interface DashboardPageProps {
  onBack: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

function formatTokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}K`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}

function relativeTime(isoString: string): string {
  const now = Date.now();
  const then = new Date(isoString).getTime();
  const diff = now - then;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  const d = new Date(isoString);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function statusBadge(status: string): string {
  switch (status) {
    case "active": return "dash-badge-active";
    case "paused": return "dash-badge-paused";
    case "completed": return "dash-badge-completed";
    case "cancelled": return "dash-badge-cancelled";
    default: return "";
  }
}

export default function DashboardPage({ onBack }: DashboardPageProps) {
  const [activeTab, setActiveTab] = useState<DashboardTab>("overview");
  const [error, setError] = useState<string | null>(null);

  // Overview state
  const [tasksSummary, setTasksSummary] = useState<TasksSummaryDto | null>(null);
  const [dbStats, setDbStats] = useState<DbStatsDto | null>(null);
  const [usageAll, setUsageAll] = useState<UsageSummaryDto | null>(null);
  const [usage24h, setUsage24h] = useState<UsageSummaryDto | null>(null);

  // Tasks state
  const [tasks, setTasks] = useState<ScheduledTaskDto[]>([]);
  const [tasksTotal, setTasksTotal] = useState(0);
  const [taskFilter, setTaskFilter] = useState<string>("");
  const [taskPage, setTaskPage] = useState(0);
  const [expandedTask, setExpandedTask] = useState<number | null>(null);
  const [taskLogs, setTaskLogs] = useState<TaskRunLogDto[]>([]);

  // Memories state
  const [memories, setMemories] = useState<DashboardMemoryDto[]>([]);
  const [memoriesTotal, setMemoriesTotal] = useState(0);
  const [memorySearch, setMemorySearch] = useState("");
  const [memoryIncludeArchived, setMemoryIncludeArchived] = useState(false);
  const [memoryPage, setMemoryPage] = useState(0);

  // Usage state
  const [usageModels, setUsageModels] = useState<ModelUsageDto[]>([]);
  const [usagePeriod, setUsagePeriod] = useState<string>("all");

  const PAGE_SIZE = 20;

  // Load overview data
  const loadOverview = useCallback(async () => {
    setError(null);
    try {
      const [summary, stats, all, day] = await Promise.all([
        getDashboardTasksSummary(),
        getDbStats(),
        getUsageSummary(),
        getUsageSummary(undefined, new Date(Date.now() - 86400000).toISOString()),
      ]);
      setTasksSummary(summary);
      setDbStats(stats);
      setUsageAll(all);
      setUsage24h(day);
    } catch (e: unknown) {
      setError(String(e));
    }
  }, []);

  // Load tasks
  const loadTasks = useCallback(async () => {
    setError(null);
    try {
      const result = await getDashboardTasks(
        taskFilter || undefined,
        undefined,
        PAGE_SIZE,
        taskPage * PAGE_SIZE,
      );
      setTasks(result.tasks);
      setTasksTotal(result.total);
    } catch (e: unknown) {
      setError(String(e));
    }
  }, [taskFilter, taskPage]);

  // Load memories
  const loadMemories = useCallback(async () => {
    setError(null);
    try {
      const result = await getDashboardMemories(
        null,
        undefined,
        memorySearch || undefined,
        memoryIncludeArchived,
        PAGE_SIZE,
        memoryPage * PAGE_SIZE,
      );
      setMemories(result.memories);
      setMemoriesTotal(result.total);
    } catch (e: unknown) {
      setError(String(e));
    }
  }, [memorySearch, memoryIncludeArchived, memoryPage]);

  // Load usage
  const loadUsage = useCallback(async () => {
    setError(null);
    try {
      let since: string | undefined;
      if (usagePeriod === "24h") since = new Date(Date.now() - 86400000).toISOString();
      else if (usagePeriod === "7d") since = new Date(Date.now() - 7 * 86400000).toISOString();
      const models = await getUsageByModel(undefined, since);
      setUsageModels(models);
    } catch (e: unknown) {
      setError(String(e));
    }
  }, [usagePeriod]);

  // Tab change trigger
  useEffect(() => {
    if (activeTab === "overview") loadOverview();
    else if (activeTab === "tasks") loadTasks();
    else if (activeTab === "memories") loadMemories();
    else if (activeTab === "usage") loadUsage();
  }, [activeTab, loadOverview, loadTasks, loadMemories, loadUsage]);

  // Load task logs when expanding
  useEffect(() => {
    if (expandedTask !== null) {
      getTaskRunLogs(expandedTask).then(setTaskLogs).catch(() => setTaskLogs([]));
    }
  }, [expandedTask]);

  return (
    <div className="settings-page">
      <div className="settings-header">
        <button className="btn-back" onClick={onBack}>&larr; Back</button>
        <h1>Dashboard</h1>
      </div>
      <div className="settings-split">
        <nav className="settings-nav">
          {(["overview", "tasks", "memories", "usage"] as DashboardTab[]).map((tab) => (
            <button
              key={tab}
              className={`settings-nav-item ${activeTab === tab ? "settings-nav-active" : ""}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </nav>
        <div className="settings-panel">
          <div className="dash-content">
            {error && <div className="dash-error">{error}</div>}

            {activeTab === "overview" && (
              <div className="dash-overview">
                <h2>System Overview</h2>

                {/* DB Stats */}
                {dbStats && (
                  <div className="dash-card-grid">
                    <div className="dash-card">
                      <div className="dash-card-value">{dbStats.chats_count}</div>
                      <div className="dash-card-label">Chats</div>
                    </div>
                    <div className="dash-card">
                      <div className="dash-card-value">{dbStats.messages_count.toLocaleString()}</div>
                      <div className="dash-card-label">Messages</div>
                    </div>
                    <div className="dash-card">
                      <div className="dash-card-value">{dbStats.memories_count}</div>
                      <div className="dash-card-label">Memories</div>
                    </div>
                    <div className="dash-card">
                      <div className="dash-card-value">{formatBytes(dbStats.db_size_bytes)}</div>
                      <div className="dash-card-label">DB Size</div>
                    </div>
                  </div>
                )}

                {/* Tasks Summary */}
                {tasksSummary && (
                  <>
                    <h3>Scheduled Tasks</h3>
                    <div className="dash-card-grid">
                      <div className="dash-card">
                        <div className="dash-card-value">{tasksSummary.active}</div>
                        <div className="dash-card-label">Active</div>
                      </div>
                      <div className="dash-card">
                        <div className="dash-card-value">{tasksSummary.paused}</div>
                        <div className="dash-card-label">Paused</div>
                      </div>
                      <div className="dash-card">
                        <div className="dash-card-value">{tasksSummary.runs_24h}</div>
                        <div className="dash-card-label">Runs (24h)</div>
                      </div>
                      <div className="dash-card">
                        <div className="dash-card-value dash-card-value-error">
                          {tasksSummary.failures_24h}
                        </div>
                        <div className="dash-card-label">Failures (24h)</div>
                      </div>
                    </div>
                  </>
                )}

                {/* Usage Summary */}
                {usageAll && (
                  <>
                    <h3>Token Usage</h3>
                    <div className="dash-card-grid">
                      <div className="dash-card">
                        <div className="dash-card-value">{usageAll.requests.toLocaleString()}</div>
                        <div className="dash-card-label">Total Requests</div>
                      </div>
                      <div className="dash-card">
                        <div className="dash-card-value">{formatTokens(usageAll.total_tokens)}</div>
                        <div className="dash-card-label">Total Tokens</div>
                      </div>
                      <div className="dash-card">
                        <div className="dash-card-value">{usage24h ? usage24h.requests.toLocaleString() : "0"}</div>
                        <div className="dash-card-label">Requests (24h)</div>
                      </div>
                      <div className="dash-card">
                        <div className="dash-card-value">{usage24h ? formatTokens(usage24h.total_tokens) : "0"}</div>
                        <div className="dash-card-label">Tokens (24h)</div>
                      </div>
                    </div>
                  </>
                )}

                {!dbStats && !tasksSummary && !usageAll && (
                  <p className="dash-loading">Loading...</p>
                )}
              </div>
            )}

            {activeTab === "tasks" && (
              <div className="dash-tasks">
                <h2>All Scheduled Tasks</h2>
                <div className="dash-toolbar">
                  <select
                    value={taskFilter}
                    onChange={(e) => { setTaskFilter(e.target.value); setTaskPage(0); }}
                    className="dash-select"
                  >
                    <option value="">All statuses</option>
                    <option value="active">Active</option>
                    <option value="paused">Paused</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                  <span className="dash-count">{tasksTotal} task{tasksTotal !== 1 ? "s" : ""}</span>
                </div>

                {tasks.length === 0 ? (
                  <p className="dash-empty">No tasks found.</p>
                ) : (
                  <div className="dash-table-wrap">
                    <table className="dash-table">
                      <thead>
                        <tr>
                          <th>ID</th>
                          <th>Prompt</th>
                          <th>Schedule</th>
                          <th>Status</th>
                          <th>Next Run</th>
                          <th>Last Run</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tasks.map((t) => (
                          <>
                            <tr
                              key={t.id}
                              className={`dash-table-row ${expandedTask === t.id ? "dash-table-row-expanded" : ""}`}
                              onClick={() => setExpandedTask(expandedTask === t.id ? null : t.id)}
                            >
                              <td className="dash-td-mono">{t.id}</td>
                              <td className="dash-td-prompt">{t.prompt}</td>
                              <td className="dash-td-mono">
                                {t.schedule_type === "cron" ? t.schedule_value : "once"}
                              </td>
                              <td>
                                <span className={`dash-badge ${statusBadge(t.status)}`}>
                                  {t.status}
                                </span>
                              </td>
                              <td>{relativeTime(t.next_run)}</td>
                              <td>{t.last_run ? relativeTime(t.last_run) : "--"}</td>
                            </tr>
                            {expandedTask === t.id && (
                              <tr key={`${t.id}-logs`} className="dash-table-detail">
                                <td colSpan={6}>
                                  <div className="dash-logs">
                                    <strong>Recent Runs</strong>
                                    {taskLogs.length === 0 ? (
                                      <p className="dash-empty">No run logs yet.</p>
                                    ) : (
                                      <table className="dash-table dash-table-inner">
                                        <thead>
                                          <tr>
                                            <th>Started</th>
                                            <th>Duration</th>
                                            <th>Status</th>
                                            <th>Summary</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {taskLogs.map((l) => (
                                            <tr key={l.id}>
                                              <td>{relativeTime(l.started_at)}</td>
                                              <td>{formatDuration(l.duration_ms)}</td>
                                              <td>
                                                <span className={`dash-badge ${l.success ? "dash-badge-active" : "dash-badge-cancelled"}`}>
                                                  {l.success ? "OK" : "FAIL"}
                                                </span>
                                              </td>
                                              <td className="dash-td-summary">
                                                {l.result_summary || "--"}
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {tasksTotal > PAGE_SIZE && (
                  <div className="dash-pagination">
                    <button
                      disabled={taskPage === 0}
                      onClick={() => setTaskPage((p) => Math.max(0, p - 1))}
                    >
                      Prev
                    </button>
                    <span>
                      Page {taskPage + 1} of {Math.ceil(tasksTotal / PAGE_SIZE)}
                    </span>
                    <button
                      disabled={(taskPage + 1) * PAGE_SIZE >= tasksTotal}
                      onClick={() => setTaskPage((p) => p + 1)}
                    >
                      Next
                    </button>
                  </div>
                )}
              </div>
            )}

            {activeTab === "memories" && (
              <div className="dash-memories">
                <h2>Memory Browser</h2>
                <div className="dash-toolbar">
                  <input
                    type="text"
                    className="dash-search"
                    placeholder="Search memories..."
                    value={memorySearch}
                    onChange={(e) => { setMemorySearch(e.target.value); setMemoryPage(0); }}
                  />
                  <label className="dash-checkbox">
                    <input
                      type="checkbox"
                      checked={memoryIncludeArchived}
                      onChange={(e) => { setMemoryIncludeArchived(e.target.checked); setMemoryPage(0); }}
                    />
                    Include archived
                  </label>
                  <span className="dash-count">{memoriesTotal} memor{memoriesTotal !== 1 ? "ies" : "y"}</span>
                </div>

                {memories.length === 0 ? (
                  <p className="dash-empty">No memories found.</p>
                ) : (
                  <div className="dash-memory-list">
                    {memories.map((m) => (
                      <div
                        key={m.id}
                        className={`dash-memory-item ${m.is_archived ? "dash-memory-archived" : ""}`}
                      >
                        <div className="dash-memory-header">
                          <span className="dash-badge dash-badge-category">{m.category}</span>
                          <span className="dash-memory-meta">
                            confidence: {(m.confidence * 100).toFixed(0)}%
                          </span>
                          <span className="dash-memory-meta">
                            {m.chat_id ? `chat #${m.chat_id}` : "global"}
                          </span>
                          <span className="dash-memory-meta">
                            {relativeTime(m.updated_at)}
                          </span>
                          {m.is_archived && (
                            <span className="dash-badge dash-badge-paused">archived</span>
                          )}
                        </div>
                        <div className="dash-memory-content">{m.content}</div>
                        <div className="dash-memory-footer">
                          <span>source: {m.source}</span>
                          <span>created: {new Date(m.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {memoriesTotal > PAGE_SIZE && (
                  <div className="dash-pagination">
                    <button
                      disabled={memoryPage === 0}
                      onClick={() => setMemoryPage((p) => Math.max(0, p - 1))}
                    >
                      Prev
                    </button>
                    <span>
                      Page {memoryPage + 1} of {Math.ceil(memoriesTotal / PAGE_SIZE)}
                    </span>
                    <button
                      disabled={(memoryPage + 1) * PAGE_SIZE >= memoriesTotal}
                      onClick={() => setMemoryPage((p) => p + 1)}
                    >
                      Next
                    </button>
                  </div>
                )}
              </div>
            )}

            {activeTab === "usage" && (
              <div className="dash-usage">
                <h2>Usage by Model</h2>
                <div className="dash-toolbar">
                  <select
                    value={usagePeriod}
                    onChange={(e) => setUsagePeriod(e.target.value)}
                    className="dash-select"
                  >
                    <option value="all">All time</option>
                    <option value="24h">Last 24 hours</option>
                    <option value="7d">Last 7 days</option>
                  </select>
                </div>

                {usageModels.length === 0 ? (
                  <p className="dash-empty">No usage data.</p>
                ) : (
                  <div className="dash-table-wrap">
                    <table className="dash-table">
                      <thead>
                        <tr>
                          <th>Model</th>
                          <th style={{ textAlign: "right" }}>Requests</th>
                          <th style={{ textAlign: "right" }}>Input</th>
                          <th style={{ textAlign: "right" }}>Output</th>
                          <th style={{ textAlign: "right" }}>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {usageModels.map((m) => (
                          <tr key={m.model}>
                            <td className="dash-td-mono">{m.model}</td>
                            <td style={{ textAlign: "right" }}>{m.requests.toLocaleString()}</td>
                            <td style={{ textAlign: "right" }}>{formatTokens(m.input_tokens)}</td>
                            <td style={{ textAlign: "right" }}>{formatTokens(m.output_tokens)}</td>
                            <td style={{ textAlign: "right" }}><strong>{formatTokens(m.total_tokens)}</strong></td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td><strong>Total</strong></td>
                          <td style={{ textAlign: "right" }}>
                            <strong>{usageModels.reduce((s, m) => s + m.requests, 0).toLocaleString()}</strong>
                          </td>
                          <td style={{ textAlign: "right" }}>
                            <strong>{formatTokens(usageModels.reduce((s, m) => s + m.input_tokens, 0))}</strong>
                          </td>
                          <td style={{ textAlign: "right" }}>
                            <strong>{formatTokens(usageModels.reduce((s, m) => s + m.output_tokens, 0))}</strong>
                          </td>
                          <td style={{ textAlign: "right" }}>
                            <strong>{formatTokens(usageModels.reduce((s, m) => s + m.total_tokens, 0))}</strong>
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
