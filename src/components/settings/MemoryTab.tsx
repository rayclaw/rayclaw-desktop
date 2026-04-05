import { useMemories } from "./useMemories";
import { fmtDate } from "../../lib/format";

interface Props {
  active: boolean;
}

export default function MemoryTab({ active }: Props) {
  const mem = useMemories(active);

  return (
    <div className="settings-panel-content">
      <h2>Memory</h2>

      {/* Observability summary */}
      {mem.obs && (
        <div className="memory-obs-grid">
          <div className="memory-obs-card">
            <span className="memory-obs-value">{mem.obs.active}</span>
            <span className="memory-obs-label">Active</span>
          </div>
          <div className="memory-obs-card">
            <span className="memory-obs-value">{mem.obs.archived}</span>
            <span className="memory-obs-label">Archived</span>
          </div>
          <div className="memory-obs-card">
            <span className="memory-obs-value">{mem.obs.low_confidence}</span>
            <span className="memory-obs-label">Low Conf.</span>
          </div>
          <div className="memory-obs-card">
            <span className="memory-obs-value">{(mem.obs.avg_confidence * 100).toFixed(0)}%</span>
            <span className="memory-obs-label">Avg Conf.</span>
          </div>
          <div className="memory-obs-card">
            <span className="memory-obs-value">{mem.obs.reflector_runs_24h}</span>
            <span className="memory-obs-label">Reflector (24h)</span>
          </div>
          <div className="memory-obs-card">
            <span className="memory-obs-value">{mem.obs.injection_selected_24h}</span>
            <span className="memory-obs-label">Injected (24h)</span>
          </div>
        </div>
      )}

      {/* Search + filter */}
      <div className="memory-toolbar">
        <input
          type="text"
          className="memory-search-input"
          placeholder="Search memories..."
          value={mem.search}
          onChange={(e) => mem.setSearch(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") mem.fetchMemories(); }}
        />
        <label className="memory-toggle-archived">
          <input
            type="checkbox"
            checked={mem.showArchived}
            onChange={(e) => mem.setShowArchived(e.target.checked)}
          />
          Show archived
        </label>
      </div>

      {/* Edit form */}
      {mem.editingMemory && (
        <div className="memory-edit-form">
          <h4>Edit Memory #{mem.editingMemory.id}</h4>
          <textarea
            value={mem.editContent}
            onChange={(e) => mem.setEditContent(e.target.value)}
            rows={4}
          />
          <div className="memory-edit-row">
            <select value={mem.editCategory} onChange={(e) => mem.setEditCategory(e.target.value)}>
              <option value="PROFILE">PROFILE</option>
              <option value="KNOWLEDGE">KNOWLEDGE</option>
              <option value="EVENT">EVENT</option>
            </select>
            <button className="btn-save" style={{ fontSize: 12, padding: "4px 12px" }} onClick={mem.saveEdit}>Save</button>
            <button className="btn-back" style={{ fontSize: 12 }} onClick={mem.cancelEdit}>Cancel</button>
          </div>
        </div>
      )}

      {/* Memory list */}
      <div className="memory-list">
        {mem.memories.length === 0 && <p className="settings-hint">No memories found.</p>}
        {mem.memories.map((m) => (
          <div key={m.id} className={`memory-item ${m.is_archived ? "memory-item-archived" : ""}`}>
            <div className="memory-item-header">
              <span className="memory-item-category">{m.category}</span>
              <span className="memory-item-conf">{(m.confidence * 100).toFixed(0)}%</span>
              <span className="memory-item-source">{m.source}</span>
              {m.is_archived && <span className="memory-item-badge">archived</span>}
            </div>
            <p className="memory-item-content">{m.content}</p>
            <div className="memory-item-footer">
              <span className="memory-item-date">{fmtDate(m.updated_at)}</span>
              <div className="memory-item-actions">
                <button onClick={() => mem.startEdit(m)}>Edit</button>
                {!m.is_archived && <button onClick={() => mem.archive(m.id)}>Archive</button>}
                <button className="memory-btn-danger" onClick={() => mem.remove(m.id)}>Delete</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
