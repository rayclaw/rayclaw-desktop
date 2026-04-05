import { useScheduler } from "./useScheduler";
import { fmtDate } from "../../lib/format";

interface Props {
  active: boolean;
}

export default function SchedulerTab({ active }: Props) {
  const sch = useScheduler(active);

  return (
    <div className="settings-panel-content">
      <h2>Scheduled Tasks</h2>

      <label className="settings-field">
        <span>Chat</span>
        <select
          value={sch.chatId || ""}
          onChange={(e) => sch.setChatId(Number(e.target.value) || 0)}
        >
          <option value="">Select a chat...</option>
          {sch.chats.map((c) => (
            <option key={c.chat_id} value={c.chat_id}>
              {c.chat_title || `Chat #${c.chat_id}`} — {c.chat_type}
            </option>
          ))}
        </select>
      </label>
      {sch.chatId > 0 && (
        <button className="btn-save" style={{ fontSize: 12, padding: "4px 12px", marginBottom: 12 }} onClick={sch.fetchTasks}>
          Refresh
        </button>
      )}

      {/* Task run logs */}
      {sch.viewingTaskId && (
        <div className="task-logs-panel">
          <div className="task-logs-header">
            <h4>Run Logs — Task #{sch.viewingTaskId}</h4>
            <button className="btn-back" style={{ fontSize: 12 }} onClick={sch.closeLogs}>Close</button>
          </div>
          {sch.logs.length === 0 && <p className="settings-hint">No runs recorded yet.</p>}
          {sch.logs.map((log) => (
            <div key={log.id} className={`task-log-item ${log.success ? "" : "task-log-failed"}`}>
              <div className="task-log-header">
                <span className={log.success ? "task-log-ok" : "task-log-err"}>
                  {log.success ? "OK" : "FAIL"}
                </span>
                <span>{fmtDate(log.started_at)}</span>
                <span>{(log.duration_ms / 1000).toFixed(1)}s</span>
              </div>
              {log.result_summary && <p className="task-log-summary">{log.result_summary}</p>}
            </div>
          ))}
        </div>
      )}

      {/* Task list */}
      <div className="scheduler-task-list">
        {sch.chatId > 0 && sch.tasks.length === 0 && !sch.viewingTaskId && (
          <p className="settings-hint">No active or paused tasks for this chat.</p>
        )}
        {sch.tasks.map((t) => (
          <div key={t.id} className={`scheduler-task-item ${t.status === "paused" ? "scheduler-task-paused" : ""}`}>
            <div className="scheduler-task-header">
              <span className="scheduler-task-id">#{t.id}</span>
              <span className={`scheduler-task-status scheduler-status-${t.status}`}>{t.status}</span>
              <span className="scheduler-task-type">{t.schedule_type}</span>
            </div>
            <p className="scheduler-task-prompt">{t.prompt.length > 120 ? t.prompt.slice(0, 120) + "..." : t.prompt}</p>
            <div className="scheduler-task-meta">
              <span>Schedule: {t.schedule_value}</span>
              <span>Next: {fmtDate(t.next_run)}</span>
              {t.last_run && <span>Last: {fmtDate(t.last_run)}</span>}
            </div>
            <div className="scheduler-task-actions">
              {t.status === "active" && <button onClick={() => sch.pause(t.id)}>Pause</button>}
              {t.status === "paused" && <button onClick={() => sch.resume(t.id)}>Resume</button>}
              <button onClick={() => sch.viewLogs(t.id)}>Logs</button>
              <button onClick={() => sch.cancel(t.id)}>Cancel</button>
              <button className="memory-btn-danger" onClick={() => sch.remove(t.id)}>Delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
