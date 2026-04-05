import { useSkills } from "./useSkills";

interface Props {
  active: boolean;
}

export default function SkillsTab({ active }: Props) {
  const sk = useSkills(active);

  return (
    <div className="settings-panel-content">
      <div className="channel-panel-header">
        <h2>Skills</h2>
        <div className="channel-panel-status">
          <button className="btn-save" style={{ fontSize: 12, padding: "4px 12px" }} onClick={sk.startNew}>
            + New Skill
          </button>
        </div>
      </div>

      {sk.error && <p className="field-error" style={{ marginBottom: 12 }}>{sk.error}</p>}

      {/* Skill editor */}
      {sk.editing && (
        <div className="skill-editor">
          <label className="settings-field">
            <span>Name</span>
            <input
              type="text"
              value={sk.form.name}
              onChange={(e) => sk.setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="my-skill"
              disabled={!!sk.selectedSkill}
            />
          </label>
          <label className="settings-field">
            <span>Description</span>
            <input
              type="text"
              value={sk.form.description}
              onChange={(e) => sk.setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="What this skill does..."
            />
          </label>
          <label className="settings-field">
            <span>Platforms (comma-separated)</span>
            <input
              type="text"
              value={sk.form.platforms}
              onChange={(e) => sk.setForm((f) => ({ ...f, platforms: e.target.value }))}
              placeholder="linux, darwin, windows (empty = all)"
            />
          </label>
          <label className="settings-field">
            <span>Dependencies (comma-separated)</span>
            <input
              type="text"
              value={sk.form.deps}
              onChange={(e) => sk.setForm((f) => ({ ...f, deps: e.target.value }))}
              placeholder="curl, python3 (empty = none)"
            />
          </label>
          <label className="settings-field">
            <span>Instructions (Markdown)</span>
            <textarea
              className="skill-content-editor"
              value={sk.form.content}
              onChange={(e) => sk.setForm((f) => ({ ...f, content: e.target.value }))}
              rows={12}
              placeholder={"# How to use this skill\n\nStep-by-step instructions..."}
            />
          </label>
          <div className="skill-editor-actions">
            <button className="btn-save" onClick={sk.save} disabled={sk.saving || !sk.form.name.trim()}>
              {sk.saving ? "Saving..." : "Save"}
            </button>
            <button className="btn-back" onClick={sk.cancelEdit}>Cancel</button>
          </div>
        </div>
      )}

      {/* Skill detail view */}
      {!sk.editing && sk.selectedSkill && (
        <div className="skill-detail">
          <div className="skill-detail-header">
            <h3>{sk.selectedSkill.meta.name}</h3>
            <div className="skill-detail-actions">
              <button className="btn-back" style={{ fontSize: 12 }} onClick={sk.startEdit}>Edit</button>
              <button className="btn-back" style={{ fontSize: 12, color: "var(--error)" }} onClick={() => sk.remove(sk.selectedSkill!.meta.name)}>Delete</button>
            </div>
          </div>
          <p className="skill-description">{sk.selectedSkill.meta.description}</p>
          <div className="skill-meta-tags">
            {sk.selectedSkill.meta.available
              ? <span className="skill-tag skill-tag-available">Available</span>
              : <span className="skill-tag skill-tag-unavailable" title={sk.selectedSkill.meta.unavailable_reason ?? ""}>Unavailable</span>
            }
            <span className="skill-tag">{sk.selectedSkill.meta.source}</span>
            {sk.selectedSkill.meta.platforms.length > 0 && (
              <span className="skill-tag">{sk.selectedSkill.meta.platforms.join(", ")}</span>
            )}
            {sk.selectedSkill.meta.deps.length > 0 && (
              <span className="skill-tag">deps: {sk.selectedSkill.meta.deps.join(", ")}</span>
            )}
            {sk.selectedSkill.meta.version && (
              <span className="skill-tag">v{sk.selectedSkill.meta.version}</span>
            )}
          </div>
          {sk.selectedSkill.meta.unavailable_reason && (
            <p className="skill-unavailable-reason">{sk.selectedSkill.meta.unavailable_reason}</p>
          )}
          <pre className="skill-content-preview">{sk.selectedSkill.content}</pre>
        </div>
      )}

      {/* Skill list */}
      {!sk.editing && !sk.selectedSkill && (
        <div className="skill-list">
          {sk.skills.length === 0 && (
            <p className="settings-hint">No skills found. Click "+ New Skill" to create one.</p>
          )}
          {sk.skills.map((s) => (
            <button
              key={s.name}
              className={`skill-list-item ${!s.available ? "skill-list-item-unavailable" : ""}`}
              onClick={() => sk.selectSkill(s.name)}
            >
              <div className="skill-list-item-header">
                <span className="skill-list-item-name">{s.name}</span>
                <span className={`skill-list-item-dot ${s.available ? "skill-dot-available" : "skill-dot-unavailable"}`} />
              </div>
              <span className="skill-list-item-desc">{s.description.slice(0, 80)}{s.description.length > 80 ? "..." : ""}</span>
              <span className="skill-list-item-source">{s.source}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
