import { useState, useEffect, useCallback, useRef } from "react";
import { getConfig, saveConfig, getChannelStatus, toggleChannel, listSkills } from "../lib/tauri-api";
import type { ConfigDto, ChannelStatus } from "../types";
import { validate, type ValidationErrors } from "./settings/validation";
import SettingsNav, { type SettingsTab } from "./settings/SettingsNav";
import ProviderTab from "./settings/ProviderTab";
import SkillsTab from "./settings/SkillsTab";
import MemoryTab from "./settings/MemoryTab";
import UsageTab from "./settings/UsageTab";
import SchedulerTab from "./settings/SchedulerTab";
import SessionTab from "./settings/SessionTab";
import PathsTab from "./settings/PathsTab";
import AdvancedTab from "./settings/AdvancedTab";
import McpTab from "./settings/McpTab";
import ChannelPanel, { type ChannelFieldDef } from "./settings/ChannelPanel";

interface SettingsPageProps {
  onBack: () => void;
  onSaved: () => void;
}

const CHANNEL_FIELDS: Record<string, { label: string; fields: ChannelFieldDef[] }> = {
  telegram: {
    label: "Telegram",
    fields: [
      { key: "telegram_bot_token", label: "Bot Token", password: true, placeholder: "123456:ABC-DEF..." },
      { key: "bot_username", label: "Bot Username", placeholder: "my_bot" },
    ],
  },
  discord: {
    label: "Discord",
    fields: [
      { key: "discord_bot_token", label: "Bot Token", password: true, placeholder: "Discord bot token" },
    ],
  },
  slack: {
    label: "Slack",
    fields: [
      { key: "slack_bot_token", label: "Bot Token", password: true, placeholder: "xoxb-..." },
      { key: "slack_app_token", label: "App Token", password: true, placeholder: "xapp-..." },
    ],
  },
  feishu: {
    label: "Feishu / Lark",
    fields: [
      { key: "feishu_app_id", label: "App ID", placeholder: "cli_xxx" },
      { key: "feishu_app_secret", label: "App Secret", password: true },
    ],
  },
};

export default function SettingsPage({ onBack, onSaved }: SettingsPageProps) {
  const [config, setConfig] = useState<ConfigDto | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [channelStatuses, setChannelStatuses] = useState<ChannelStatus[]>([]);
  const [activeTab, setActiveTab] = useState<SettingsTab>("provider");
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>({});
  const [skillCount, setSkillCount] = useState(0);
  const initialConfigRef = useRef<string>("");
  const [darkMode, setDarkMode] = useState(() => {
    return document.documentElement.getAttribute("data-theme") === "dark";
  });

  const isDirty = config ? JSON.stringify(config) !== initialConfigRef.current : false;

  const fetchStatuses = useCallback(() => {
    getChannelStatus().then(setChannelStatuses).catch(() => {});
  }, []);

  useEffect(() => {
    getConfig().then((c) => {
      setConfig(c);
      initialConfigRef.current = JSON.stringify(c);
    });
    listSkills().then((s) => setSkillCount(s.length)).catch(() => {});
    fetchStatuses();
    const interval = setInterval(fetchStatuses, 5000);
    return () => clearInterval(interval);
  }, [fetchStatuses]);

  const update = <K extends keyof ConfigDto>(key: K, value: ConfigDto[K]) => {
    setConfig((prev) => {
      if (!prev) return prev;
      const next = { ...prev, [key]: value };
      setValidationErrors(validate(next));
      return next;
    });
    setSuccess(false);
    setError(null);
  };

  const handleSave = async () => {
    if (!config) return;
    const errs = validate(config);
    setValidationErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      await saveConfig(config);
      setSuccess(true);
      initialConfigRef.current = JSON.stringify(config);
      onSaved();
      setTimeout(fetchStatuses, 1000);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (name: string, enabled: boolean) => {
    try {
      await toggleChannel(name, enabled);
      setTimeout(fetchStatuses, 500);
    } catch (e) {
      setError(String(e));
    }
  };

  const handleDarkMode = (enabled: boolean) => {
    setDarkMode(enabled);
    document.documentElement.setAttribute("data-theme", enabled ? "dark" : "light");
    localStorage.setItem("rayclaw-theme", enabled ? "dark" : "light");
  };

  const handleBack = () => {
    if (isDirty) {
      if (!window.confirm("You have unsaved changes. Discard and leave?")) return;
    }
    onBack();
  };

  if (!config) {
    return (
      <main className="settings-page">
        <p style={{ color: "var(--muted)" }}>Loading...</p>
      </main>
    );
  }

  const hasErrors = Object.keys(validationErrors).length > 0;
  const channelKey = activeTab.startsWith("ch:") ? activeTab.slice(3) : null;
  const channelDef = channelKey ? CHANNEL_FIELDS[channelKey] : null;

  return (
    <main className="settings-page">
      <div className="settings-header">
        <button className="btn-back" onClick={handleBack}>
          &larr; Back
        </button>
        <h1>Settings</h1>
        <div className="settings-header-actions">
          {error && <span className="settings-error">{error}</span>}
          {success && <span className="settings-success">Saved</span>}
          {isDirty && !success && <span className="settings-dirty">Unsaved</span>}
          <button className="btn-save" onClick={handleSave} disabled={saving || hasErrors}>
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>

      <div className="settings-split">
        <SettingsNav
          activeTab={activeTab}
          onSelectTab={setActiveTab}
          channelStatuses={channelStatuses}
          skillCount={skillCount}
        />

        <div className="settings-panel">
          {activeTab === "provider" && (
            <ProviderTab config={config} validationErrors={validationErrors} onUpdate={update} />
          )}
          {activeTab === "skills" && <SkillsTab active={activeTab === "skills"} />}
          {activeTab === "mcp" && <McpTab active={activeTab === "mcp"} />}
          {activeTab === "memory" && <MemoryTab active={activeTab === "memory"} />}
          {activeTab === "usage" && <UsageTab active={activeTab === "usage"} />}
          {activeTab === "scheduler" && <SchedulerTab active={activeTab === "scheduler"} />}
          {activeTab === "session" && (
            <SessionTab config={config} validationErrors={validationErrors} onUpdate={update} />
          )}
          {activeTab === "paths" && (
            <PathsTab config={config} validationErrors={validationErrors} onUpdate={update} />
          )}
          {activeTab === "advanced" && (
            <AdvancedTab
              active={activeTab === "advanced"}
              config={config}
              validationErrors={validationErrors}
              darkMode={darkMode}
              onUpdate={update}
              onDarkModeChange={handleDarkMode}
            />
          )}

          {/* Channel panels */}
          {channelDef && (
            <ChannelPanel
              name={channelKey!}
              label={channelDef.label}
              fields={channelDef.fields}
              config={config}
              status={channelStatuses.find((s) => s.name === channelKey)}
              onUpdate={update}
              onToggle={handleToggle}
            />
          )}

          {/* Web UI — simple toggle, no ChannelPanel */}
          {activeTab === "ch:web" && (
            <div className="settings-panel-content">
              <div className="channel-panel-header">
                <h2>Web UI</h2>
                <div className="channel-panel-status">
                  <label className="channel-switch">
                    <input
                      type="checkbox"
                      checked={config.web_enabled}
                      onChange={(e) => update("web_enabled", e.target.checked)}
                    />
                    <span className="switch-slider" />
                  </label>
                </div>
              </div>
              <p className="settings-hint">
                Enable the built-in Web UI served by the agent at runtime.
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
