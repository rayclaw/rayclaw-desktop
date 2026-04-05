import type { ConfigDto } from "../../types";
import type { ValidationErrors } from "./validation";

interface Props {
  config: ConfigDto;
  validationErrors: ValidationErrors;
  onUpdate: <K extends keyof ConfigDto>(key: K, value: ConfigDto[K]) => void;
}

export default function SessionTab({ config, validationErrors, onUpdate }: Props) {
  const fieldErr = (key: string) => validationErrors[key];

  return (
    <div className="settings-panel-content">
      <h2>Session</h2>

      <label className={`settings-field ${fieldErr("max_tool_iterations") ? "settings-field-error" : ""}`}>
        <span>Max Tool Iterations</span>
        <input
          type="number"
          value={config.max_tool_iterations}
          onChange={(e) => onUpdate("max_tool_iterations", Number(e.target.value) || 0)}
          min={1}
        />
      </label>
      {fieldErr("max_tool_iterations") && <p className="field-error">{fieldErr("max_tool_iterations")}</p>}

      <label className={`settings-field ${fieldErr("max_history_messages") ? "settings-field-error" : ""}`}>
        <span>Max History Messages</span>
        <input
          type="number"
          value={config.max_history_messages}
          onChange={(e) => onUpdate("max_history_messages", Number(e.target.value) || 0)}
          min={1}
        />
      </label>
      {fieldErr("max_history_messages") && <p className="field-error">{fieldErr("max_history_messages")}</p>}

      <label className={`settings-field ${fieldErr("max_session_messages") ? "settings-field-error" : ""}`}>
        <span>Max Session Messages</span>
        <input
          type="number"
          value={config.max_session_messages}
          onChange={(e) => onUpdate("max_session_messages", Number(e.target.value) || 0)}
          min={1}
        />
      </label>
      {fieldErr("max_session_messages") && <p className="field-error">{fieldErr("max_session_messages")}</p>}
    </div>
  );
}
