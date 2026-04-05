import { useUsage } from "./useUsage";
import { fmtTokens, fmtDate } from "../../lib/format";

interface Props {
  active: boolean;
}

export default function UsageTab({ active }: Props) {
  const usage = useUsage(active);

  return (
    <div className="settings-panel-content">
      <div className="channel-panel-header">
        <h2>Usage</h2>
        <div className="usage-range-select">
          {["today", "7d", "30d", "all"].map((r) => (
            <button
              key={r}
              className={`usage-range-btn ${usage.range === r ? "usage-range-active" : ""}`}
              onClick={() => usage.setRange(r)}
            >
              {r === "all" ? "All Time" : r === "today" ? "Today" : r}
            </button>
          ))}
        </div>
      </div>

      {usage.error && <p className="field-error" style={{ marginTop: 12 }}>{usage.error}</p>}

      {usage.summary ? (
        <div className="usage-summary-grid">
          <div className="usage-stat-card">
            <span className="usage-stat-value">{usage.summary.requests.toLocaleString()}</span>
            <span className="usage-stat-label">Requests</span>
          </div>
          <div className="usage-stat-card">
            <span className="usage-stat-value">{fmtTokens(usage.summary.input_tokens)}</span>
            <span className="usage-stat-label">Input Tokens</span>
          </div>
          <div className="usage-stat-card">
            <span className="usage-stat-value">{fmtTokens(usage.summary.output_tokens)}</span>
            <span className="usage-stat-label">Output Tokens</span>
          </div>
          <div className="usage-stat-card">
            <span className="usage-stat-value">{fmtTokens(usage.summary.total_tokens)}</span>
            <span className="usage-stat-label">Total Tokens</span>
          </div>
        </div>
      ) : !usage.error && (
        <p className="settings-hint" style={{ marginTop: 12 }}>Loading usage data...</p>
      )}

      {usage.summary?.last_request_at && (
        <p className="settings-hint" style={{ marginTop: 8 }}>
          Last request: {fmtDate(usage.summary.last_request_at)}
        </p>
      )}

      {usage.models.length > 0 && (
        <>
          <div className="settings-divider" />
          <h3>By Model</h3>
          <table className="usage-model-table">
            <thead>
              <tr>
                <th>Model</th>
                <th>Requests</th>
                <th>Input</th>
                <th>Output</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {usage.models.map((m) => (
                <tr key={m.model}>
                  <td className="usage-model-name">{m.model}</td>
                  <td>{m.requests.toLocaleString()}</td>
                  <td>{fmtTokens(m.input_tokens)}</td>
                  <td>{fmtTokens(m.output_tokens)}</td>
                  <td>{fmtTokens(m.total_tokens)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
