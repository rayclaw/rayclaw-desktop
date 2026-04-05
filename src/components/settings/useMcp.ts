import { useState, useCallback, useEffect } from "react";
import { getMcpConfig, saveMcpConfig } from "../../lib/tauri-api";
import type { McpConfigDto, McpServerConfig } from "../../types";

export interface McpServerForm {
  name: string;
  transport: string;
  command: string;
  args: string;
  env: string;
  endpoint: string;
  headers: string;
  protocol_version: string;
  request_timeout_secs: string;
  max_retries: string;
  health_interval_secs: string;
}

const emptyForm: McpServerForm = {
  name: "",
  transport: "stdio",
  command: "",
  args: "",
  env: "",
  endpoint: "",
  headers: "",
  protocol_version: "",
  request_timeout_secs: "",
  max_retries: "",
  health_interval_secs: "",
};

function serverToForm(name: string, s: McpServerConfig): McpServerForm {
  return {
    name,
    transport: s.transport || "stdio",
    command: s.command ?? "",
    args: (s.args ?? []).join("\n"),
    env: Object.entries(s.env ?? {}).map(([k, v]) => `${k}=${v}`).join("\n"),
    endpoint: s.endpoint ?? "",
    headers: Object.entries(s.headers ?? {}).map(([k, v]) => `${k}=${v}`).join("\n"),
    protocol_version: s.protocol_version ?? "",
    request_timeout_secs: s.request_timeout_secs != null ? String(s.request_timeout_secs) : "",
    max_retries: s.max_retries != null ? String(s.max_retries) : "",
    health_interval_secs: s.health_interval_secs != null ? String(s.health_interval_secs) : "",
  };
}

function formToServer(f: McpServerForm): McpServerConfig {
  const base: McpServerConfig = { transport: f.transport };

  if (f.protocol_version) base.protocol_version = f.protocol_version;
  if (f.request_timeout_secs) base.request_timeout_secs = Number(f.request_timeout_secs);
  if (f.max_retries) base.max_retries = Number(f.max_retries);
  if (f.health_interval_secs) base.health_interval_secs = Number(f.health_interval_secs);

  if (f.transport === "stdio") {
    base.command = f.command;
    base.args = f.args.split("\n").map((s) => s.trim()).filter(Boolean);
    const env: Record<string, string> = {};
    for (const line of f.env.split("\n")) {
      const idx = line.indexOf("=");
      if (idx > 0) env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    }
    if (Object.keys(env).length > 0) base.env = env;
  } else {
    base.endpoint = f.endpoint;
    const headers: Record<string, string> = {};
    for (const line of f.headers.split("\n")) {
      const idx = line.indexOf("=");
      if (idx > 0) headers[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    }
    if (Object.keys(headers).length > 0) base.headers = headers;
  }

  return base;
}

export function useMcp(active: boolean) {
  const [config, setConfig] = useState<McpConfigDto | null>(null);
  const [selectedServer, setSelectedServer] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<McpServerForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchConfig = useCallback(() => {
    getMcpConfig().then(setConfig).catch((e) => setError(String(e)));
  }, []);

  useEffect(() => {
    if (active) fetchConfig();
  }, [active, fetchConfig]);

  const selectServer = (name: string) => {
    setSelectedServer(name);
    setEditing(false);
    setError(null);
  };

  const backToList = () => {
    setSelectedServer(null);
    setEditing(false);
    setError(null);
  };

  const startNew = () => {
    setSelectedServer(null);
    setEditing(true);
    setForm(emptyForm);
    setError(null);
  };

  const startEdit = (name: string) => {
    if (!config) return;
    const server = config.mcp_servers[name];
    if (!server) return;
    setForm(serverToForm(name, server));
    setEditing(true);
    setError(null);
  };

  const save = async () => {
    if (!config) return;
    if (!form.name.trim()) {
      setError("Server name is required");
      return;
    }
    if (form.transport === "stdio" && !form.command.trim()) {
      setError("Command is required for stdio transport");
      return;
    }
    if (form.transport === "streamable_http" && !form.endpoint.trim()) {
      setError("Endpoint is required for HTTP transport");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const updated: McpConfigDto = {
        ...config,
        mcp_servers: {
          ...config.mcp_servers,
          [form.name.trim()]: formToServer(form) as unknown as McpServerConfig,
        },
      };
      await saveMcpConfig(updated);
      setConfig(updated);
      setEditing(false);
      setSelectedServer(form.name.trim());
      fetchConfig();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (name: string) => {
    if (!config) return;
    if (!window.confirm(`Delete MCP server "${name}"? This cannot be undone.`)) return;
    setError(null);
    try {
      const { [name]: _, ...rest } = config.mcp_servers;
      const updated: McpConfigDto = { ...config, mcp_servers: rest };
      await saveMcpConfig(updated);
      setConfig(updated);
      setSelectedServer(null);
      setEditing(false);
      fetchConfig();
    } catch (e) {
      setError(String(e));
    }
  };

  const cancelEdit = () => {
    setEditing(false);
    setError(null);
  };

  const serverNames = config ? Object.keys(config.mcp_servers) : [];

  return {
    config,
    serverNames,
    selectedServer,
    editing,
    form,
    setForm,
    saving,
    error,
    selectServer,
    backToList,
    startNew,
    startEdit,
    save,
    remove,
    cancelEdit,
  };
}
