import type { ConfigDto } from "../../types";
import type { ValidationErrors } from "./validation";

interface Props {
  config: ConfigDto;
  validationErrors: ValidationErrors;
  onUpdate: <K extends keyof ConfigDto>(key: K, value: ConfigDto[K]) => void;
}

export default function PathsTab({ config, validationErrors, onUpdate }: Props) {
  const fieldErr = (key: string) => validationErrors[key];

  return (
    <div className="settings-panel-content">
      <h2>Paths</h2>

      <label className={`settings-field ${fieldErr("data_dir") ? "settings-field-error" : ""}`}>
        <span>Data Directory</span>
        <input
          type="text"
          value={config.data_dir}
          onChange={(e) => onUpdate("data_dir", e.target.value)}
        />
      </label>
      {fieldErr("data_dir") && <p className="field-error">{fieldErr("data_dir")}</p>}

      <label className={`settings-field ${fieldErr("working_dir") ? "settings-field-error" : ""}`}>
        <span>Working Directory</span>
        <input
          type="text"
          value={config.working_dir}
          onChange={(e) => onUpdate("working_dir", e.target.value)}
        />
      </label>
      {fieldErr("working_dir") && <p className="field-error">{fieldErr("working_dir")}</p>}

      <label className="settings-field">
        <span>Timezone</span>
        <input
          type="text"
          value={config.timezone}
          onChange={(e) => onUpdate("timezone", e.target.value)}
          placeholder="UTC"
        />
      </label>
    </div>
  );
}
