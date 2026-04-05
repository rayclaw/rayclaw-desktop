import type { ConfigDto } from "../../types";
import type { ValidationErrors } from "./validation";
import PasswordField from "./PasswordField";

const PROVIDERS = [
  "anthropic", "openai", "bedrock", "ollama", "google", "deepseek",
  "openrouter", "mistral", "alibaba", "moonshot", "xai", "custom",
];

interface Props {
  config: ConfigDto;
  validationErrors: ValidationErrors;
  onUpdate: <K extends keyof ConfigDto>(key: K, value: ConfigDto[K]) => void;
}

export default function ProviderTab({ config, validationErrors, onUpdate }: Props) {
  const fieldErr = (key: string) => validationErrors[key];
  const isBedrock = config.llm_provider === "bedrock";

  return (
    <div className="settings-panel-content">
      <h2>AI Provider</h2>

      <label className="settings-field">
        <span>Provider</span>
        <select
          value={config.llm_provider}
          onChange={(e) => onUpdate("llm_provider", e.target.value)}
        >
          {PROVIDERS.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      </label>

      <label className="settings-field">
        <span>API Key</span>
        <PasswordField
          value={config.api_key}
          onChange={(v) => onUpdate("api_key", v)}
          placeholder="sk-..."
        />
      </label>

      <label className="settings-field">
        <span>Model</span>
        <input
          type="text"
          value={config.model}
          onChange={(e) => onUpdate("model", e.target.value)}
          placeholder="Leave empty for provider default"
        />
      </label>

      <label className={`settings-field ${fieldErr("llm_base_url") ? "settings-field-error" : ""}`}>
        <span>Base URL (optional)</span>
        <input
          type="text"
          value={config.llm_base_url ?? ""}
          onChange={(e) => onUpdate("llm_base_url", e.target.value || null)}
          placeholder="https://api.example.com/v1"
        />
      </label>
      {fieldErr("llm_base_url") && <p className="field-error">{fieldErr("llm_base_url")}</p>}

      <label className={`settings-field ${fieldErr("max_tokens") ? "settings-field-error" : ""}`}>
        <span>Max Tokens</span>
        <input
          type="number"
          value={config.max_tokens}
          onChange={(e) => onUpdate("max_tokens", Number(e.target.value) || 0)}
          min={1}
        />
      </label>
      {fieldErr("max_tokens") && <p className="field-error">{fieldErr("max_tokens")}</p>}

      <label className="settings-field settings-toggle">
        <span>Show Thinking</span>
        <input
          type="checkbox"
          checked={config.show_thinking}
          onChange={(e) => onUpdate("show_thinking", e.target.checked)}
        />
      </label>

      {isBedrock && (
        <>
          <div className="settings-divider" />
          <h3>AWS Bedrock</h3>

          <label className="settings-field">
            <span>Region</span>
            <input
              type="text"
              value={config.aws_region ?? ""}
              onChange={(e) => onUpdate("aws_region", e.target.value || null)}
              placeholder="us-east-1"
            />
          </label>

          <label className="settings-field">
            <span>Access Key ID</span>
            <PasswordField
              value={config.aws_access_key_id ?? ""}
              onChange={(v) => onUpdate("aws_access_key_id", v || null)}
            />
          </label>

          <label className="settings-field">
            <span>Secret Access Key</span>
            <PasswordField
              value={config.aws_secret_access_key ?? ""}
              onChange={(v) => onUpdate("aws_secret_access_key", v || null)}
            />
          </label>

          <label className="settings-field">
            <span>Profile (optional)</span>
            <input
              type="text"
              value={config.aws_profile ?? ""}
              onChange={(e) => onUpdate("aws_profile", e.target.value || null)}
              placeholder="default"
            />
          </label>
        </>
      )}
    </div>
  );
}
