import { useState } from "react";
import type { ChannelStatus } from "../../types";

export type SettingsTab =
  | "provider"
  | "skills"
  | "memory"
  | "usage"
  | "scheduler"
  | "session"
  | "paths"
  | "advanced"
  | "ch:telegram"
  | "ch:discord"
  | "ch:slack"
  | "ch:feishu"
  | "ch:web";

const CHANNELS: { key: string; label: string }[] = [
  { key: "telegram", label: "Telegram" },
  { key: "discord", label: "Discord" },
  { key: "slack", label: "Slack" },
  { key: "feishu", label: "Feishu / Lark" },
  { key: "web", label: "Web UI" },
];

interface Props {
  activeTab: SettingsTab;
  onSelectTab: (tab: SettingsTab) => void;
  channelStatuses: ChannelStatus[];
  skillCount: number;
}

export default function SettingsNav({ activeTab, onSelectTab, channelStatuses, skillCount }: Props) {
  const [channelsOpen, setChannelsOpen] = useState(false);

  const isChannelTab = activeTab.startsWith("ch:");
  const runningCount = channelStatuses.filter((s) => s.running).length;

  const statusOf = (name: string) => channelStatuses.find((s) => s.name === name);

  const toggleChannelsOpen = () => {
    if (channelsOpen) {
      setChannelsOpen(false);
    } else {
      setChannelsOpen(true);
      onSelectTab("ch:telegram");
    }
  };

  const selectChannel = (key: string) => {
    onSelectTab(`ch:${key}` as SettingsTab);
    setChannelsOpen(true);
  };

  const StatusDot = ({ name }: { name: string }) => {
    const st = statusOf(name);
    if (st?.running) return <span className="nav-dot nav-dot-running" />;
    if (st?.configured) return <span className="nav-dot nav-dot-stopped" />;
    return null;
  };

  const NavItem = ({ tab, label, badge }: { tab: SettingsTab; label: string; badge?: number }) => (
    <button
      className={`settings-nav-item ${activeTab === tab ? "settings-nav-active" : ""}`}
      onClick={() => onSelectTab(tab)}
    >
      {label}
      {badge !== undefined && badge > 0 && <span className="nav-badge">{badge}</span>}
    </button>
  );

  return (
    <nav className="settings-nav">
      <NavItem tab="provider" label="AI Provider" />
      <NavItem tab="skills" label="Skills" badge={skillCount} />

      <button
        className={`settings-nav-item settings-nav-group ${isChannelTab ? "settings-nav-active" : ""}`}
        onClick={toggleChannelsOpen}
      >
        <span>Channels</span>
        <span className="nav-group-right">
          {runningCount > 0 && <span className="nav-badge">{runningCount}</span>}
          <span className={`nav-arrow ${channelsOpen ? "nav-arrow-open" : ""}`}>&#9654;</span>
        </span>
      </button>
      {channelsOpen && (
        <div className="settings-nav-children">
          {CHANNELS.map((ch) => (
            <button
              key={ch.key}
              className={`settings-nav-item settings-nav-child ${activeTab === `ch:${ch.key}` ? "settings-nav-active" : ""}`}
              onClick={() => selectChannel(ch.key)}
            >
              <StatusDot name={ch.key} />
              {ch.label}
            </button>
          ))}
        </div>
      )}

      <NavItem tab="memory" label="Memory" />
      <NavItem tab="usage" label="Usage" />
      <NavItem tab="scheduler" label="Scheduler" />
      <NavItem tab="session" label="Session" />
      <NavItem tab="paths" label="Paths" />
      <NavItem tab="advanced" label="Advanced" />
    </nav>
  );
}
