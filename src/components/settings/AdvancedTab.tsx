import type { ConfigDto } from "../../types";
import type { ValidationErrors } from "./validation";
import { useSoul } from "./useSoul";

interface Props {
  active: boolean;
  config: ConfigDto;
  validationErrors: ValidationErrors;
  darkMode: boolean;
  onUpdate: <K extends keyof ConfigDto>(key: K, value: ConfigDto[K]) => void;
  onDarkModeChange: (enabled: boolean) => void;
}

export default function AdvancedTab({ active, config, validationErrors, darkMode, onUpdate, onDarkModeChange }: Props) {
  const fieldErr = (key: string) => validationErrors[key];
  const soul = useSoul(active);

  return (
    <div className="settings-panel-content">
      <h2>Advanced</h2>

      <h3>Appearance</h3>
      <label className="settings-field settings-toggle">
        <span>Dark Mode</span>
        <input
          type="checkbox"
          checked={darkMode}
          onChange={(e) => onDarkModeChange(e.target.checked)}
        />
      </label>

      <div className="settings-divider" />
      <h3>Agent</h3>

      <label className="settings-field settings-toggle">
        <span>Skip Tool Approval</span>
        <input
          type="checkbox"
          checked={config.skip_tool_approval}
          onChange={(e) => onUpdate("skip_tool_approval", e.target.checked)}
        />
      </label>

      <label className="settings-field settings-toggle">
        <span>Memory Reflector</span>
        <input
          type="checkbox"
          checked={config.reflector_enabled}
          onChange={(e) => onUpdate("reflector_enabled", e.target.checked)}
        />
      </label>

      <label className={`settings-field ${fieldErr("memory_token_budget") ? "settings-field-error" : ""}`}>
        <span>Memory Token Budget</span>
        <input
          type="number"
          value={config.memory_token_budget}
          onChange={(e) => onUpdate("memory_token_budget", Number(e.target.value) || 0)}
          min={1}
        />
      </label>
      {fieldErr("memory_token_budget") && <p className="field-error">{fieldErr("memory_token_budget")}</p>}

      <div className="settings-divider" />
      <div className="soul-editor-section">
        <div className="soul-editor-header">
          <h3>Personality (SOUL.md)</h3>
          <div className="soul-editor-actions">
            {soul.saved && <span className="settings-success">Saved</span>}
            {soul.dirty && !soul.saved && <span className="settings-dirty">Unsaved</span>}
            <button
              className="btn-save"
              style={{ fontSize: 12, padding: "4px 12px" }}
              onClick={soul.save}
              disabled={soul.saving || !soul.dirty}
            >
              {soul.saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
        <p className="settings-hint">
          Define the bot's personality, values, and communication style. This is injected into the system prompt for all conversations.
        </p>
        <textarea
          className="soul-editor-textarea"
          value={soul.content}
          onChange={(e) => { soul.setContent(e.target.value); soul.setSaved(false); }}
          rows={14}
          placeholder={"# Personality\n\nYou are a helpful assistant...\n\n# Communication Style\n\n- Be concise and clear\n- Use a friendly tone"}
        />
        <p className="settings-hint" style={{ marginTop: 6 }}>
          {soul.path}
        </p>
      </div>
    </div>
  );
}
