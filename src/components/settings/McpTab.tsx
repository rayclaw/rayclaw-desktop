import { useMcp } from "./useMcp";

interface Props {
  active: boolean;
}

export default function McpTab({ active }: Props) {
  const mcp = useMcp(active);

  const serverConfig = mcp.selectedServer && mcp.config
    ? mcp.config.mcp_servers[mcp.selectedServer]
    : null;

  return (
    <div className="settings-panel-content">
      <div className="channel-panel-header">
        <h2>MCP Servers</h2>
        <div className="channel-panel-status">
          {mcp.selectedServer && !mcp.editing && (
            <button className="btn-back" style={{ fontSize: 12, marginRight: 8 }} onClick={mcp.backToList}>
              &larr; List
            </button>
          )}
          {!mcp.editing && (
            <button className="btn-save" style={{ fontSize: 12, padding: "4px 12px" }} onClick={mcp.startNew}>
              + New Server
            </button>
          )}
        </div>
      </div>

      {mcp.error && <p className="field-error" style={{ marginBottom: 12 }}>{mcp.error}</p>}

      {/* Editor view */}
      {mcp.editing && (
        <div className="skill-editor">
          <label className="settings-field">
            <span>Server Name</span>
            <input
              type="text"
              value={mcp.form.name}
              onChange={(e) => mcp.setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="my-server"
              disabled={!!mcp.selectedServer}
            />
          </label>

          <label className="settings-field">
            <span>Transport</span>
            <select
              value={mcp.form.transport}
              onChange={(e) => mcp.setForm((f) => ({ ...f, transport: e.target.value }))}
            >
              <option value="stdio">stdio</option>
              <option value="streamable_http">streamable_http</option>
            </select>
          </label>

          {mcp.form.transport === "stdio" && (
            <>
              <label className="settings-field">
                <span>Command</span>
                <input
                  type="text"
                  value={mcp.form.command}
                  onChange={(e) => mcp.setForm((f) => ({ ...f, command: e.target.value }))}
                  placeholder="npx"
                />
              </label>
              <label className="settings-field">
                <span>Arguments (one per line)</span>
                <textarea
                  className="skill-content-editor"
                  value={mcp.form.args}
                  onChange={(e) => mcp.setForm((f) => ({ ...f, args: e.target.value }))}
                  rows={3}
                  placeholder={"-y\n@modelcontextprotocol/server-filesystem\n."}
                />
              </label>
              <label className="settings-field">
                <span>Environment (KEY=VALUE per line)</span>
                <textarea
                  className="skill-content-editor"
                  value={mcp.form.env}
                  onChange={(e) => mcp.setForm((f) => ({ ...f, env: e.target.value }))}
                  rows={2}
                  placeholder="API_KEY=sk-..."
                />
              </label>
            </>
          )}

          {mcp.form.transport === "streamable_http" && (
            <>
              <label className="settings-field">
                <span>Endpoint URL</span>
                <input
                  type="text"
                  value={mcp.form.endpoint}
                  onChange={(e) => mcp.setForm((f) => ({ ...f, endpoint: e.target.value }))}
                  placeholder="http://127.0.0.1:8080/mcp"
                />
              </label>
              <label className="settings-field">
                <span>Headers (KEY=VALUE per line)</span>
                <textarea
                  className="skill-content-editor"
                  value={mcp.form.headers}
                  onChange={(e) => mcp.setForm((f) => ({ ...f, headers: e.target.value }))}
                  rows={2}
                  placeholder="Authorization=Bearer REPLACE_ME"
                />
              </label>
            </>
          )}

          <div className="settings-divider" />
          <p className="settings-hint" style={{ marginBottom: 8 }}>Optional advanced settings</p>

          <label className="settings-field">
            <span>Protocol Version</span>
            <input
              type="text"
              value={mcp.form.protocol_version}
              onChange={(e) => mcp.setForm((f) => ({ ...f, protocol_version: e.target.value }))}
              placeholder="2025-11-05 (default)"
            />
          </label>
          <label className="settings-field">
            <span>Request Timeout (seconds)</span>
            <input
              type="number"
              value={mcp.form.request_timeout_secs}
              onChange={(e) => mcp.setForm((f) => ({ ...f, request_timeout_secs: e.target.value }))}
              placeholder="120"
              min={1}
            />
          </label>
          {mcp.form.transport === "stdio" && (
            <>
              <label className="settings-field">
                <span>Max Retries</span>
                <input
                  type="number"
                  value={mcp.form.max_retries}
                  onChange={(e) => mcp.setForm((f) => ({ ...f, max_retries: e.target.value }))}
                  placeholder="2"
                  min={0}
                />
              </label>
              <label className="settings-field">
                <span>Health Check Interval (seconds)</span>
                <input
                  type="number"
                  value={mcp.form.health_interval_secs}
                  onChange={(e) => mcp.setForm((f) => ({ ...f, health_interval_secs: e.target.value }))}
                  placeholder="60"
                  min={1}
                />
              </label>
            </>
          )}

          <div className="skill-editor-actions">
            <button className="btn-save" onClick={mcp.save} disabled={mcp.saving || !mcp.form.name.trim()}>
              {mcp.saving ? "Saving..." : "Save"}
            </button>
            <button className="btn-back" onClick={mcp.cancelEdit}>Cancel</button>
          </div>
        </div>
      )}

      {/* Detail view */}
      {!mcp.editing && mcp.selectedServer && serverConfig && (
        <div className="skill-detail">
          <div className="skill-detail-header">
            <h3>{mcp.selectedServer}</h3>
            <div className="skill-detail-actions">
              <button className="btn-back" style={{ fontSize: 12 }} onClick={() => mcp.startEdit(mcp.selectedServer!)}>Edit</button>
              <button className="btn-back" style={{ fontSize: 12, color: "var(--error)" }} onClick={() => mcp.remove(mcp.selectedServer!)}>Delete</button>
            </div>
          </div>

          <div className="skill-meta-tags">
            <span className="skill-tag">{serverConfig.transport}</span>
            {serverConfig.protocol_version && <span className="skill-tag">v{serverConfig.protocol_version}</span>}
            {serverConfig.request_timeout_secs && <span className="skill-tag">timeout: {serverConfig.request_timeout_secs}s</span>}
          </div>

          {serverConfig.transport === "stdio" && (
            <div style={{ marginTop: 12 }}>
              <label className="settings-field">
                <span>Command</span>
                <code style={{ fontSize: 13 }}>{serverConfig.command} {(serverConfig.args ?? []).join(" ")}</code>
              </label>
              {serverConfig.env && Object.keys(serverConfig.env).length > 0 && (
                <label className="settings-field">
                  <span>Environment</span>
                  <pre className="skill-content-preview" style={{ marginTop: 4 }}>
                    {Object.entries(serverConfig.env).map(([k, v]) => `${k}=${v}`).join("\n")}
                  </pre>
                </label>
              )}
            </div>
          )}

          {serverConfig.transport === "streamable_http" && (
            <div style={{ marginTop: 12 }}>
              <label className="settings-field">
                <span>Endpoint</span>
                <code style={{ fontSize: 13 }}>{serverConfig.endpoint}</code>
              </label>
              {serverConfig.headers && Object.keys(serverConfig.headers).length > 0 && (
                <label className="settings-field">
                  <span>Headers</span>
                  <pre className="skill-content-preview" style={{ marginTop: 4 }}>
                    {Object.entries(serverConfig.headers).map(([k, v]) => `${k}=${v}`).join("\n")}
                  </pre>
                </label>
              )}
            </div>
          )}
        </div>
      )}

      {/* List view */}
      {!mcp.editing && !mcp.selectedServer && (
        <div className="skill-list">
          {mcp.serverNames.length === 0 && (
            <p className="settings-hint">No MCP servers configured. Click "+ New Server" to add one.</p>
          )}
          {mcp.serverNames.map((name) => {
            const s = mcp.config!.mcp_servers[name];
            return (
              <button
                key={name}
                className="skill-list-item"
                onClick={() => mcp.selectServer(name)}
              >
                <div className="skill-list-item-header">
                  <span className="skill-list-item-name">{name}</span>
                  <span className={`skill-list-item-dot skill-dot-available`} />
                </div>
                <span className="skill-list-item-desc">
                  {s.transport === "stdio"
                    ? `${s.command ?? ""} ${(s.args ?? []).join(" ")}`.trim()
                    : s.endpoint ?? ""}
                </span>
                <span className="skill-list-item-source">{s.transport}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
