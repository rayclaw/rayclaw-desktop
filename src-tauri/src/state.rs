use rayclaw::runtime::AppState;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

/// Per-channel enabled state, persisted to ~/.rayclaw/channel-enabled.json.
pub type ChannelEnabledMap = HashMap<String, bool>;

const ENABLED_FILE: &str = "channel-enabled.json";

fn enabled_path() -> String {
    let home = crate::home_dir();
    format!("{home}/.rayclaw/{ENABLED_FILE}")
}

pub fn load_channel_enabled() -> ChannelEnabledMap {
    let path = enabled_path();
    std::fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

pub fn save_channel_enabled(map: &ChannelEnabledMap) {
    let path = enabled_path();
    if let Ok(json) = serde_json::to_string_pretty(map) {
        let _ = std::fs::write(&path, json);
    }
}

pub struct DesktopState {
    pub app_state: RwLock<Option<Arc<AppState>>>,
    pub init_error: RwLock<Option<String>>,
    pub runtime: tokio::runtime::Runtime,
    /// Named handles for spawned channel adapter tasks — aborted on reinit.
    pub channel_handles: std::sync::Mutex<HashMap<String, tokio::task::JoinHandle<()>>>,
    /// Per-channel enabled toggle — persisted across restarts.
    pub channel_enabled: std::sync::Mutex<ChannelEnabledMap>,
}
