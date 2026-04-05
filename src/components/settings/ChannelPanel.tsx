import type { ConfigDto, ChannelStatus } from "../../types";
import PasswordField from "./PasswordField";

export interface ChannelFieldDef {
  key: keyof ConfigDto;
  label: string;
  password?: boolean;
  placeholder?: string;
}

interface ChannelPanelProps {
  name: string;
  label: string;
  fields: ChannelFieldDef[];
  config: ConfigDto;
  status: ChannelStatus | undefined;
  onUpdate: <K extends keyof ConfigDto>(key: K, value: ConfigDto[K]) => void;
  onToggle: (name: string, enabled: boolean) => void;
}

export default function ChannelPanel({ name, label, fields, config, status, onUpdate, onToggle }: ChannelPanelProps) {
  return (
    <div className="settings-panel-content">
      <div className="channel-panel-header">
        <h2>{label}</h2>
        <div className="channel-panel-status">
          {status?.running && <span className="status-pill status-running">Running</span>}
          {status?.configured && !status?.running && <span className="status-pill status-stopped">Stopped</span>}
          {status?.configured && (
            <label className="channel-switch">
              <input
                type="checkbox"
                checked={status?.enabled ?? true}
                onChange={(e) => onToggle(name, e.target.checked)}
              />
              <span className="switch-slider" />
            </label>
          )}
        </div>
      </div>

      {fields.map((f) => (
        <label key={String(f.key)} className="settings-field">
          <span>{f.label}</span>
          {f.password ? (
            <PasswordField
              value={(config[f.key] as string) ?? ""}
              onChange={(v) => onUpdate(f.key, (v || null) as ConfigDto[typeof f.key])}
              placeholder={f.placeholder}
            />
          ) : (
            <input
              type="text"
              value={(config[f.key] as string) ?? ""}
              onChange={(e) => onUpdate(f.key, (e.target.value || null) as ConfigDto[typeof f.key])}
              placeholder={f.placeholder}
            />
          )}
        </label>
      ))}
    </div>
  );
}
