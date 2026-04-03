use crate::state::DesktopState;
use rayclaw::runtime::AppState;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::{Emitter, Manager};
use tracing::{debug, error, info};

// ---------------------------------------------------------------------------
// DTOs
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize)]
pub struct AppStatus {
    pub ready: bool,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ChatSummaryDto {
    pub chat_id: i64,
    pub chat_title: Option<String>,
    pub chat_type: String,
    pub last_message_time: String,
    pub last_message_preview: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct StoredMessageDto {
    pub id: String,
    pub chat_id: i64,
    pub sender_name: String,
    pub content: String,
    pub is_from_bot: bool,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type")]
pub enum AgentStreamPayload {
    #[serde(rename = "iteration")]
    Iteration { chat_id: i64, iteration: usize },
    #[serde(rename = "tool_start")]
    ToolStart { chat_id: i64, name: String },
    #[serde(rename = "tool_result")]
    ToolResult {
        chat_id: i64,
        name: String,
        is_error: bool,
        preview: String,
        duration_ms: u64,
    },
    #[serde(rename = "text_delta")]
    TextDelta { chat_id: i64, delta: String },
    #[serde(rename = "final_response")]
    FinalResponse { chat_id: i64, text: String },
    #[serde(rename = "error")]
    Error { chat_id: i64, message: String },
}

/// Configuration DTO for the settings UI.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfigDto {
    // Model
    pub llm_provider: String,
    pub api_key: String,
    pub model: String,
    pub llm_base_url: Option<String>,
    pub max_tokens: u32,
    pub show_thinking: bool,
    // AWS Bedrock
    pub aws_region: Option<String>,
    pub aws_access_key_id: Option<String>,
    pub aws_secret_access_key: Option<String>,
    pub aws_profile: Option<String>,
    // Session
    pub max_tool_iterations: usize,
    pub max_history_messages: usize,
    pub max_session_messages: usize,
    // Paths
    pub data_dir: String,
    pub working_dir: String,
    pub timezone: String,
    // Advanced
    pub skip_tool_approval: bool,
    pub soul_path: Option<String>,
    pub memory_token_budget: usize,
    pub reflector_enabled: bool,
    // Channels — Telegram
    pub telegram_bot_token: String,
    pub bot_username: String,
    // Channels — Discord
    pub discord_bot_token: Option<String>,
    // Channels — Slack
    pub slack_bot_token: Option<String>,
    pub slack_app_token: Option<String>,
    // Channels — Feishu
    pub feishu_app_id: Option<String>,
    pub feishu_app_secret: Option<String>,
    // Channels — Web
    pub web_enabled: bool,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn home_dir() -> String {
    std::env::var("HOME").unwrap_or_else(|_| ".".into())
}

fn expand_tilde(path: &str) -> String {
    if let Some(rest) = path.strip_prefix("~/") {
        format!("{}/{}", home_dir(), rest)
    } else if path == "~" {
        home_dir()
    } else {
        path.to_string()
    }
}

fn default_config() -> rayclaw::config::Config {
    let home = home_dir();
    let yaml = format!(
        r#"
llm_provider: anthropic
api_key: ""
model: ""
data_dir: "{home}/.rayclaw/data"
working_dir: "{home}/.rayclaw/tmp"
timezone: UTC
web_enabled: false
"#
    );
    serde_yaml::from_str(&yaml).expect("default config YAML is always valid")
}

fn mask_secret(s: &str) -> String {
    if s.len() <= 8 {
        "*".repeat(s.len())
    } else {
        format!("{}...{}", &s[..4], &s[s.len() - 4..])
    }
}

fn is_masked(s: &str) -> bool {
    s.contains("...") || s.contains("*")
}

async fn require_state(state: &DesktopState) -> Result<Arc<AppState>, String> {
    state
        .app_state
        .read()
        .await
        .clone()
        .ok_or_else(|| "Agent not initialized. Please configure in Settings.".to_string())
}

fn default_config_path() -> String {
    let dir = format!("{}/.rayclaw", home_dir());
    let _ = std::fs::create_dir_all(&dir);
    format!("{dir}/rayclaw.config.yaml")
}

/// Load config for Desktop without channel validation.
/// This allows the Settings UI to read config even when no channels are enabled.
fn load_config_for_desktop() -> rayclaw::config::Config {
    let path = default_config_path();
    match std::fs::read_to_string(&path) {
        Ok(content) => {
            serde_yaml::from_str(&content).unwrap_or_else(|e| {
                debug!("Failed to parse config: {e}");
                default_config()
            })
        }
        Err(_) => default_config(),
    }
}

fn channel_str(
    channels: &std::collections::HashMap<String, serde_yaml::Value>,
    channel: &str,
    key: &str,
) -> Option<String> {
    channels
        .get(channel)
        .and_then(|v| v.get(key))
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
}

fn apply_channel_field(
    channels: &mut std::collections::HashMap<String, serde_yaml::Value>,
    channel: &str,
    key: &str,
    value: Option<String>,
) {
    if let Some(val) = value.filter(|s| !s.is_empty()) {
        let entry = channels
            .entry(channel.to_string())
            .or_insert_with(|| serde_yaml::Value::Mapping(serde_yaml::Mapping::new()));
        if let serde_yaml::Value::Mapping(ref mut map) = entry {
            map.insert(
                serde_yaml::Value::String(key.to_string()),
                serde_yaml::Value::String(val),
            );
        }
    }
}

fn apply_channel_secret(
    channels: &mut std::collections::HashMap<String, serde_yaml::Value>,
    channel: &str,
    key: &str,
    value: Option<String>,
) {
    if let Some(ref val) = value {
        if is_masked(val) {
            return;
        }
    }
    apply_channel_field(channels, channel, key, value);
}

/// Store a user message in the database (since we use AppState directly, not SDK).
fn store_user_message(state: &AppState, chat_id: i64, text: &str) {
    let _ = state.db.upsert_chat(chat_id, None, "desktop");
    let msg = rayclaw::db::StoredMessage {
        id: uuid::Uuid::new_v4().to_string(),
        chat_id,
        sender_name: "user".to_string(),
        content: text.to_string(),
        is_from_bot: false,
        timestamp: chrono::Utc::now().to_rfc3339(),
    };
    let _ = state.db.store_message(&msg);
}

/// Store a bot response in the database.
fn store_bot_message(state: &AppState, chat_id: i64, text: &str) {
    let msg = rayclaw::db::StoredMessage {
        id: uuid::Uuid::new_v4().to_string(),
        chat_id,
        sender_name: "rayclaw".to_string(),
        content: text.to_string(),
        is_from_bot: true,
        timestamp: chrono::Utc::now().to_rfc3339(),
    };
    let _ = state.db.store_message(&msg);
}

// ---------------------------------------------------------------------------
// Commands: Status & Config
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn get_status(app: tauri::AppHandle) -> Result<AppStatus, String> {
    let state = app.state::<DesktopState>();
    let app_state = state.app_state.read().await;
    let error = state.init_error.read().await;
    Ok(AppStatus {
        ready: app_state.is_some(),
        error: error.clone(),
    })
}

#[tauri::command]
pub async fn get_config(_app: tauri::AppHandle) -> Result<ConfigDto, String> {
    let config = load_config_for_desktop();

    Ok(ConfigDto {
        llm_provider: config.llm_provider.clone(),
        api_key: if config.api_key.is_empty() {
            String::new()
        } else {
            mask_secret(&config.api_key)
        },
        model: config.model.clone(),
        llm_base_url: config.llm_base_url.clone(),
        max_tokens: config.max_tokens,
        show_thinking: config.show_thinking,
        aws_region: config.aws_region.clone(),
        aws_access_key_id: config.aws_access_key_id.as_ref().map(|s| mask_secret(s)),
        aws_secret_access_key: config.aws_secret_access_key.as_ref().map(|s| mask_secret(s)),
        aws_profile: config.aws_profile.clone(),
        max_tool_iterations: config.max_tool_iterations,
        max_history_messages: config.max_history_messages,
        max_session_messages: config.max_session_messages,
        data_dir: config.data_dir.clone(),
        working_dir: config.working_dir.clone(),
        timezone: config.timezone.clone(),
        skip_tool_approval: config.skip_tool_approval,
        soul_path: config.soul_path.clone(),
        memory_token_budget: config.memory_token_budget,
        reflector_enabled: config.reflector_enabled,
        telegram_bot_token: if config.telegram_bot_token.is_empty() {
            String::new()
        } else {
            mask_secret(&config.telegram_bot_token)
        },
        bot_username: config.bot_username.clone(),
        discord_bot_token: config.discord_bot_token.as_ref().map(|s| mask_secret(s)),
        slack_bot_token: channel_str(&config.channels, "slack", "bot_token")
            .map(|s| mask_secret(&s)),
        slack_app_token: channel_str(&config.channels, "slack", "app_token")
            .map(|s| mask_secret(&s)),
        feishu_app_id: channel_str(&config.channels, "feishu", "app_id"),
        feishu_app_secret: channel_str(&config.channels, "feishu", "app_secret")
            .map(|s| mask_secret(&s)),
        web_enabled: config.web_enabled,
    })
}

#[tauri::command]
pub async fn save_config(app: tauri::AppHandle, config: ConfigDto) -> Result<(), String> {
    info!(
        "save_config: provider={}, model={}",
        config.llm_provider, config.model
    );
    let mut full_config = load_config_for_desktop();

    // Apply DTO fields (skip masked secrets)
    full_config.llm_provider = config.llm_provider;
    if !config.api_key.is_empty() && !is_masked(&config.api_key) {
        full_config.api_key = config.api_key;
    }
    full_config.model = config.model;
    full_config.llm_base_url = config.llm_base_url;
    full_config.max_tokens = config.max_tokens;
    full_config.show_thinking = config.show_thinking;

    full_config.aws_region = config.aws_region;
    if let Some(ref key) = config.aws_access_key_id {
        if !is_masked(key) {
            full_config.aws_access_key_id = Some(key.clone());
        }
    } else {
        full_config.aws_access_key_id = None;
    }
    if let Some(ref key) = config.aws_secret_access_key {
        if !is_masked(key) {
            full_config.aws_secret_access_key = Some(key.clone());
        }
    } else {
        full_config.aws_secret_access_key = None;
    }
    full_config.aws_profile = config.aws_profile;

    full_config.max_tool_iterations = config.max_tool_iterations;
    full_config.max_history_messages = config.max_history_messages;
    full_config.max_session_messages = config.max_session_messages;
    full_config.data_dir = expand_tilde(&config.data_dir);
    full_config.working_dir = expand_tilde(&config.working_dir);
    full_config.timezone = config.timezone;
    full_config.skip_tool_approval = config.skip_tool_approval;
    full_config.soul_path = config.soul_path.map(|p| expand_tilde(&p));
    full_config.memory_token_budget = config.memory_token_budget;
    full_config.reflector_enabled = config.reflector_enabled;

    // Channels — Telegram
    if !config.telegram_bot_token.is_empty() && !is_masked(&config.telegram_bot_token) {
        full_config.telegram_bot_token = config.telegram_bot_token;
    }
    full_config.bot_username = config.bot_username;

    // Channels — Discord
    if let Some(ref token) = config.discord_bot_token {
        if !is_masked(token) {
            full_config.discord_bot_token = Some(token.clone());
        }
    } else {
        full_config.discord_bot_token = None;
    }

    // Channels — Slack
    apply_channel_secret(&mut full_config.channels, "slack", "bot_token", config.slack_bot_token);
    apply_channel_secret(&mut full_config.channels, "slack", "app_token", config.slack_app_token);

    // Channels — Feishu
    apply_channel_field(&mut full_config.channels, "feishu", "app_id", config.feishu_app_id);
    apply_channel_secret(
        &mut full_config.channels,
        "feishu",
        "app_secret",
        config.feishu_app_secret,
    );

    // Channels — Web
    full_config.web_enabled = config.web_enabled;

    // Validate
    info!("save_config: validating...");
    full_config.validate_for_sdk().map_err(|e| {
        error!("save_config: validation failed: {e}");
        format!("Validation failed: {e}")
    })?;

    // Save to file
    let save_path = rayclaw::config::Config::resolve_config_path()
        .ok()
        .flatten()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(default_config_path);
    info!("save_config: saving to {save_path}");
    full_config.save_yaml(&save_path).map_err(|e| {
        error!("save_config: failed to save: {e}");
        format!("Failed to save config: {e}")
    })?;

    // Abort old channel tasks
    let desktop = app.state::<DesktopState>();
    {
        let mut handles = desktop.channel_handles.lock().unwrap();
        for (name, h) in handles.drain() {
            h.abort();
            info!("save_config: aborted channel task: {name}");
        }
    }

    // Reinitialize agent + channels on stored runtime
    info!("save_config: reinitializing agent + channels...");
    let rt_handle = desktop.runtime.handle().clone();
    let new_state = rt_handle
        .spawn(async move { crate::init_agent(full_config).await })
        .await
        .map_err(|e| {
            error!("save_config: spawn failed: {e}");
            format!("Task failed: {e}")
        })?
        .map_err(|e| {
            error!("save_config: agent init failed: {e}");
            format!("Failed to initialize agent: {e}")
        })?;

    // Start channels (respecting enabled state)
    let enabled_map = desktop.channel_enabled.lock().unwrap().clone();
    let new_handles = crate::start_channels(&new_state, &rt_handle, &enabled_map);

    {
        let mut state_lock = desktop.app_state.write().await;
        *state_lock = Some(new_state);
    }
    {
        let mut err_lock = desktop.init_error.write().await;
        *err_lock = None;
    }
    {
        let mut handles = desktop.channel_handles.lock().unwrap();
        *handles = new_handles;
    }

    info!("save_config: complete");
    Ok(())
}

// ---------------------------------------------------------------------------
// Commands: Channel Status
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize)]
pub struct ChannelStatusDto {
    pub name: String,
    pub configured: bool,
    pub enabled: bool,
    pub running: bool,
}

#[tauri::command]
pub async fn get_channel_status(app: tauri::AppHandle) -> Result<Vec<ChannelStatusDto>, String> {
    let desktop = app.state::<DesktopState>();
    let config = load_config_for_desktop();
    let handles = desktop.channel_handles.lock().unwrap();
    let enabled_map = desktop.channel_enabled.lock().unwrap();

    let channels = vec![
        (
            "telegram",
            !config.telegram_bot_token.trim().is_empty(),
        ),
        (
            "discord",
            config
                .discord_bot_token
                .as_ref()
                .map(|t| !t.trim().is_empty())
                .unwrap_or(false),
        ),
        (
            "slack",
            channel_str(&config.channels, "slack", "bot_token").is_some()
                && channel_str(&config.channels, "slack", "app_token").is_some(),
        ),
        (
            "feishu",
            channel_str(&config.channels, "feishu", "app_id").is_some()
                && channel_str(&config.channels, "feishu", "app_secret").is_some(),
        ),
    ];

    Ok(channels
        .into_iter()
        .map(|(name, configured)| {
            let enabled = enabled_map.get(name).copied().unwrap_or(true);
            let running = handles
                .get(name)
                .map(|h| !h.is_finished())
                .unwrap_or(false);
            ChannelStatusDto {
                name: name.to_string(),
                configured,
                enabled,
                running,
            }
        })
        .collect())
}

#[tauri::command]
pub async fn toggle_channel(
    app: tauri::AppHandle,
    name: String,
    enabled: bool,
) -> Result<(), String> {
    let desktop = app.state::<DesktopState>();
    info!("toggle_channel: {name} → enabled={enabled}");

    // Update persisted enabled state
    {
        let mut enabled_map = desktop.channel_enabled.lock().unwrap();
        enabled_map.insert(name.clone(), enabled);
        crate::state::save_channel_enabled(&enabled_map);
    }

    if enabled {
        // Start the channel if not already running
        let state = require_state(&desktop).await?;
        let rt_handle = desktop.runtime.handle().clone();
        let mut handles = desktop.channel_handles.lock().unwrap();

        // Check if already running
        if let Some(h) = handles.get(&name) {
            if !h.is_finished() {
                info!("toggle_channel: {name} already running");
                return Ok(());
            }
        }

        if let Some(handle) = crate::start_single_channel(&name, &state, &rt_handle) {
            handles.insert(name.clone(), handle);
            info!("toggle_channel: {name} started");
        } else {
            return Err(format!("Channel {name} is not configured"));
        }
    } else {
        // Stop the channel
        let mut handles = desktop.channel_handles.lock().unwrap();
        if let Some(h) = handles.remove(&name) {
            h.abort();
            info!("toggle_channel: {name} stopped");
        }
    }

    Ok(())
}

// ---------------------------------------------------------------------------
// Commands: Chat
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Deserialize)]
pub struct AttachmentDto {
    pub data: String,       // base64-encoded file data
    pub media_type: String, // e.g. "image/png"
    #[allow(dead_code)]
    pub name: String,       // original filename (used by frontend)
}

#[tauri::command]
pub async fn send_message(
    app: tauri::AppHandle,
    chat_id: i64,
    content: String,
    attachments: Option<Vec<AttachmentDto>>,
) -> Result<(), String> {
    let desktop = app.state::<DesktopState>();
    let state = require_state(&desktop).await?;
    let rt_handle = desktop.runtime.handle().clone();

    let attachments = attachments.unwrap_or_default();
    info!(
        "send_message: chat_id={chat_id}, len={}, attachments={}",
        content.len(),
        attachments.len()
    );

    rt_handle.spawn(async move {
        let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel();
        let app_handle = app.clone();
        let emit_app = app_handle.clone();
        let emit_chat_id = chat_id;

        let fwd = tokio::spawn(async move {
            use rayclaw::agent_engine::AgentEvent;
            while let Some(event) = rx.recv().await {
                let cid = emit_chat_id;
                let payload = match event {
                    AgentEvent::Iteration { iteration } => {
                        AgentStreamPayload::Iteration { chat_id: cid, iteration }
                    }
                    AgentEvent::ToolStart { name } => AgentStreamPayload::ToolStart { chat_id: cid, name },
                    AgentEvent::ToolResult {
                        name,
                        is_error,
                        preview,
                        duration_ms,
                        ..
                    } => AgentStreamPayload::ToolResult {
                        chat_id: cid,
                        name,
                        is_error,
                        preview,
                        duration_ms: duration_ms as u64,
                    },
                    AgentEvent::TextDelta { delta } => AgentStreamPayload::TextDelta { chat_id: cid, delta },
                    AgentEvent::FinalResponse { text } => {
                        AgentStreamPayload::FinalResponse { chat_id: cid, text }
                    }
                };
                let _ = emit_app.emit("agent-stream", &payload);
            }
        });

        // Extract first image attachment for the LLM vision API
        let image_data: Option<(String, String)> = attachments
            .iter()
            .find(|a| a.media_type.starts_with("image/"))
            .map(|a| (a.data.clone(), a.media_type.clone()));

        // Build stored content: prefix with [image] if we have an image attachment
        let stored_content = if image_data.is_some() {
            if content.trim().is_empty() {
                "[image]".to_string()
            } else {
                format!("[image] {content}")
            }
        } else {
            content.clone()
        };

        // Store user message (we're using AppState directly, not SDK)
        store_user_message(&state, chat_id, &stored_content);

        // Run agent
        debug!("send_message: starting agent for chat_id={chat_id}");
        let context = rayclaw::agent_engine::AgentRequestContext {
            caller_channel: "desktop",
            chat_id,
            chat_type: "private",
        };
        let result = rayclaw::agent_engine::process_with_agent_with_events(
            &state,
            context,
            Some(&content),
            image_data,
            Some(&tx),
        )
        .await;
        // Drop tx so the forwarder finishes
        drop(tx);

        match &result {
            Ok(text) => {
                info!("send_message: response len={}", text.len());
                if !text.is_empty() {
                    store_bot_message(&state, chat_id, text);
                }
            }
            Err(e) => {
                error!("send_message: agent error: {e}");
                let _ = app_handle.emit("agent-stream", &AgentStreamPayload::Error {
                    chat_id,
                    message: e.to_string(),
                });
            }
        }

        let _ = fwd.await;
    });

    Ok(())
}

#[tauri::command]
pub async fn get_history(
    app: tauri::AppHandle,
    chat_id: i64,
    limit: Option<usize>,
) -> Result<Vec<StoredMessageDto>, String> {
    let desktop = app.state::<DesktopState>();
    let state = require_state(&desktop).await?;
    let messages = state
        .db
        .get_recent_messages(chat_id, limit.unwrap_or(100))
        .map_err(|e| e.to_string())?;

    Ok(messages
        .into_iter()
        .map(|m| StoredMessageDto {
            id: m.id,
            chat_id: m.chat_id,
            sender_name: m.sender_name,
            content: m.content,
            is_from_bot: m.is_from_bot,
            timestamp: m.timestamp,
        })
        .collect())
}

#[tauri::command]
pub async fn get_chats(app: tauri::AppHandle) -> Result<Vec<ChatSummaryDto>, String> {
    let desktop = app.state::<DesktopState>();
    let state = require_state(&desktop).await?;
    let chats = state.db.get_recent_chats(50).map_err(|e| e.to_string())?;

    Ok(chats
        .into_iter()
        .map(|c| ChatSummaryDto {
            chat_id: c.chat_id,
            chat_title: c.chat_title,
            chat_type: c.chat_type,
            last_message_time: c.last_message_time,
            last_message_preview: c.last_message_preview,
        })
        .collect())
}

#[tauri::command]
pub async fn reset_session(app: tauri::AppHandle, chat_id: i64) -> Result<(), String> {
    let desktop = app.state::<DesktopState>();
    let state = require_state(&desktop).await?;
    state.db.delete_session(chat_id).map(|_| ()).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_chat(app: tauri::AppHandle, chat_id: i64) -> Result<(), String> {
    let desktop = app.state::<DesktopState>();
    let state = require_state(&desktop).await?;
    info!("delete_chat: chat_id={chat_id}");

    // Deletes all associated data (messages, sessions, logs, chat entry, etc.)
    state
        .db
        .delete_chat_data(chat_id)
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn export_chat_markdown(
    app: tauri::AppHandle,
    chat_id: i64,
) -> Result<String, String> {
    let desktop = app.state::<DesktopState>();
    let state = require_state(&desktop).await?;

    // Get chat info
    let chats = state.db.get_recent_chats(500).map_err(|e| e.to_string())?;
    let chat = chats.iter().find(|c| c.chat_id == chat_id);
    let title = chat
        .and_then(|c| c.chat_title.as_deref())
        .unwrap_or("Untitled Chat");

    // Get all messages (ordered ASC by timestamp)
    let messages = state
        .db
        .get_all_messages(chat_id)
        .map_err(|e| e.to_string())?;

    // Format as Markdown
    let mut md = format!("# {title}\n\n");
    for msg in &messages {
        let role = if msg.is_from_bot { "**Assistant**" } else { &format!("**{}**", msg.sender_name) };
        let ts = &msg.timestamp;
        md.push_str(&format!("### {role} — {ts}\n\n{}\n\n---\n\n", msg.content));
    }

    Ok(md)
}

#[tauri::command]
pub async fn rename_chat(
    app: tauri::AppHandle,
    chat_id: i64,
    title: String,
) -> Result<(), String> {
    let desktop = app.state::<DesktopState>();
    let state = require_state(&desktop).await?;
    info!("rename_chat: chat_id={chat_id}, title={title}");
    state
        .db
        .upsert_chat(chat_id, Some(&title), "desktop")
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Commands: SOUL.md
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize)]
pub struct SoulDto {
    pub content: String,
    pub path: String,
    pub exists: bool,
}

/// Resolve the soul file path for a given scope.
fn soul_path(state: &AppState, chat_id: Option<i64>) -> std::path::PathBuf {
    if let Some(cid) = chat_id {
        std::path::PathBuf::from(state.config.runtime_data_dir())
            .join("groups")
            .join(cid.to_string())
            .join("SOUL.md")
    } else {
        state.config.data_root_dir().join("SOUL.md")
    }
}

#[tauri::command]
pub async fn read_soul(
    app: tauri::AppHandle,
    chat_id: Option<i64>,
) -> Result<SoulDto, String> {
    let desktop = app.state::<DesktopState>();
    let state = require_state(&desktop).await?;
    let path = soul_path(&state, chat_id);
    let exists = path.exists();
    let content = if exists {
        std::fs::read_to_string(&path).unwrap_or_default()
    } else {
        String::new()
    };
    Ok(SoulDto {
        content,
        path: path.to_string_lossy().to_string(),
        exists,
    })
}

#[tauri::command]
pub async fn save_soul(
    app: tauri::AppHandle,
    chat_id: Option<i64>,
    content: String,
) -> Result<(), String> {
    let desktop = app.state::<DesktopState>();
    let state = require_state(&desktop).await?;
    let path = soul_path(&state, chat_id);

    if content.trim().is_empty() {
        // Delete the file if content is empty
        if path.exists() {
            std::fs::remove_file(&path).map_err(|e| format!("Failed to delete SOUL.md: {e}"))?;
            info!("save_soul: deleted {}", path.display());
        }
    } else {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create directory: {e}"))?;
        }
        std::fs::write(&path, &content)
            .map_err(|e| format!("Failed to write SOUL.md: {e}"))?;
        info!("save_soul: wrote {} bytes to {}", content.len(), path.display());
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Commands: Skills
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize)]
pub struct SkillDto {
    pub name: String,
    pub description: String,
    pub platforms: Vec<String>,
    pub deps: Vec<String>,
    pub source: String,
    pub version: Option<String>,
    pub updated_at: Option<String>,
    pub available: bool,
    pub unavailable_reason: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct SkillDetailDto {
    pub meta: SkillDto,
    pub content: String, // SKILL.md body (Markdown)
}

#[tauri::command]
pub async fn list_skills(app: tauri::AppHandle) -> Result<Vec<SkillDto>, String> {
    let desktop = app.state::<DesktopState>();
    let state = require_state(&desktop).await?;
    let all = state.skills.discover_all_skills();
    Ok(all
        .into_iter()
        .map(|info| SkillDto {
            name: info.metadata.name,
            description: info.metadata.description,
            platforms: info.metadata.platforms,
            deps: info.metadata.deps,
            source: info.metadata.source,
            version: info.metadata.version,
            updated_at: info.metadata.updated_at,
            available: info.available,
            unavailable_reason: info.unavailable_reason,
        })
        .collect())
}

#[tauri::command]
pub async fn get_skill(app: tauri::AppHandle, name: String) -> Result<SkillDetailDto, String> {
    let desktop = app.state::<DesktopState>();
    let state = require_state(&desktop).await?;
    let all = state.skills.discover_all_skills();
    let info = all.into_iter().find(|i| i.metadata.name == name)
        .ok_or_else(|| format!("Skill '{name}' not found"))?;

    // Read the SKILL.md body
    let skill_md = info.metadata.dir_path.join("SKILL.md");
    let raw = std::fs::read_to_string(&skill_md)
        .map_err(|e| format!("Failed to read SKILL.md: {e}"))?;

    // Extract body after frontmatter
    let body = extract_skill_body(&raw);

    Ok(SkillDetailDto {
        meta: SkillDto {
            name: info.metadata.name,
            description: info.metadata.description,
            platforms: info.metadata.platforms,
            deps: info.metadata.deps,
            source: info.metadata.source,
            version: info.metadata.version,
            updated_at: info.metadata.updated_at,
            available: info.available,
            unavailable_reason: info.unavailable_reason,
        },
        content: body,
    })
}

#[tauri::command]
pub async fn save_skill(
    app: tauri::AppHandle,
    name: String,
    description: String,
    platforms: Vec<String>,
    deps: Vec<String>,
    content: String,
) -> Result<(), String> {
    let desktop = app.state::<DesktopState>();
    let state = require_state(&desktop).await?;
    let skills_dir = state.skills.skills_dir();

    // Validate name: alphanumeric, hyphens, underscores only
    if name.is_empty() || !name.chars().all(|c| c.is_alphanumeric() || c == '-' || c == '_') {
        return Err("Skill name must be non-empty and contain only letters, digits, hyphens, or underscores.".into());
    }

    let skill_dir = skills_dir.join(&name);
    std::fs::create_dir_all(&skill_dir)
        .map_err(|e| format!("Failed to create skill directory: {e}"))?;

    // Build SKILL.md with YAML frontmatter
    let mut md = String::from("---\n");
    md.push_str(&format!("name: {name}\n"));
    md.push_str(&format!("description: \"{}\"\n", description.replace('"', "\\\"")));
    if !platforms.is_empty() {
        md.push_str(&format!("platforms: [{}]\n", platforms.join(", ")));
    }
    if !deps.is_empty() {
        md.push_str(&format!("deps: [{}]\n", deps.join(", ")));
    }
    md.push_str("source: local\n");
    md.push_str("---\n");
    md.push_str(&content);

    let skill_path = skill_dir.join("SKILL.md");
    std::fs::write(&skill_path, &md)
        .map_err(|e| format!("Failed to write SKILL.md: {e}"))?;

    info!("save_skill: wrote {}", skill_path.display());
    Ok(())
}

#[tauri::command]
pub async fn delete_skill(app: tauri::AppHandle, name: String) -> Result<(), String> {
    let desktop = app.state::<DesktopState>();
    let state = require_state(&desktop).await?;
    let skills_dir = state.skills.skills_dir();
    let skill_dir = skills_dir.join(&name);

    if !skill_dir.exists() {
        return Err(format!("Skill '{name}' not found"));
    }

    // Safety: ensure the path is within skills_dir
    let canonical_skills = skills_dir.canonicalize().map_err(|e| e.to_string())?;
    let canonical_skill = skill_dir.canonicalize().map_err(|e| e.to_string())?;
    if !canonical_skill.starts_with(&canonical_skills) {
        return Err("Path traversal not allowed".into());
    }

    std::fs::remove_dir_all(&skill_dir)
        .map_err(|e| format!("Failed to delete skill: {e}"))?;

    info!("delete_skill: removed {}", skill_dir.display());
    Ok(())
}

// ---------------------------------------------------------------------------
// Commands: Memory Management
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize)]
pub struct MemoryDto {
    pub id: i64,
    pub chat_id: Option<i64>,
    pub content: String,
    pub category: String,
    pub confidence: f64,
    pub source: String,
    pub is_archived: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct MemoryObservabilityDto {
    pub total: i64,
    pub active: i64,
    pub archived: i64,
    pub low_confidence: i64,
    pub avg_confidence: f64,
    pub reflector_runs_24h: i64,
    pub reflector_inserted_24h: i64,
    pub reflector_updated_24h: i64,
    pub reflector_skipped_24h: i64,
    pub injection_events_24h: i64,
    pub injection_selected_24h: i64,
    pub injection_candidates_24h: i64,
}

fn memory_to_dto(m: rayclaw::db::Memory) -> MemoryDto {
    MemoryDto {
        id: m.id,
        chat_id: m.chat_id,
        content: m.content,
        category: m.category,
        confidence: m.confidence,
        source: m.source,
        is_archived: m.is_archived,
        created_at: m.created_at,
        updated_at: m.updated_at,
    }
}

#[tauri::command]
pub async fn list_memories(
    app: tauri::AppHandle,
    chat_id: Option<i64>,
) -> Result<Vec<MemoryDto>, String> {
    let desktop = app.state::<DesktopState>();
    let state = require_state(&desktop).await?;
    let memories = state
        .db
        .get_all_memories_for_chat(chat_id)
        .map_err(|e| e.to_string())?;
    Ok(memories.into_iter().map(memory_to_dto).collect())
}

#[tauri::command]
pub async fn search_memories(
    app: tauri::AppHandle,
    chat_id: i64,
    query: String,
    include_archived: bool,
) -> Result<Vec<MemoryDto>, String> {
    let desktop = app.state::<DesktopState>();
    let state = require_state(&desktop).await?;
    let memories = state
        .db
        .search_memories_with_options(chat_id, &query, 100, include_archived, true)
        .map_err(|e| e.to_string())?;
    Ok(memories.into_iter().map(memory_to_dto).collect())
}

#[tauri::command]
pub async fn update_memory(
    app: tauri::AppHandle,
    id: i64,
    content: String,
    category: String,
) -> Result<bool, String> {
    let desktop = app.state::<DesktopState>();
    let state = require_state(&desktop).await?;
    state
        .db
        .update_memory_content(id, &content, &category)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn archive_memory(app: tauri::AppHandle, id: i64) -> Result<bool, String> {
    let desktop = app.state::<DesktopState>();
    let state = require_state(&desktop).await?;
    state.db.archive_memory(id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_memory(app: tauri::AppHandle, id: i64) -> Result<bool, String> {
    let desktop = app.state::<DesktopState>();
    let state = require_state(&desktop).await?;
    state.db.delete_memory(id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_memory_observability(
    app: tauri::AppHandle,
    chat_id: Option<i64>,
) -> Result<MemoryObservabilityDto, String> {
    let desktop = app.state::<DesktopState>();
    let state = require_state(&desktop).await?;
    let summary = state
        .db
        .get_memory_observability_summary(chat_id)
        .map_err(|e| e.to_string())?;
    Ok(MemoryObservabilityDto {
        total: summary.total,
        active: summary.active,
        archived: summary.archived,
        low_confidence: summary.low_confidence,
        avg_confidence: summary.avg_confidence,
        reflector_runs_24h: summary.reflector_runs_24h,
        reflector_inserted_24h: summary.reflector_inserted_24h,
        reflector_updated_24h: summary.reflector_updated_24h,
        reflector_skipped_24h: summary.reflector_skipped_24h,
        injection_events_24h: summary.injection_events_24h,
        injection_selected_24h: summary.injection_selected_24h,
        injection_candidates_24h: summary.injection_candidates_24h,
    })
}

// ---------------------------------------------------------------------------
// Commands: Usage Analytics
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize)]
pub struct UsageSummaryDto {
    pub requests: i64,
    pub input_tokens: i64,
    pub output_tokens: i64,
    pub total_tokens: i64,
    pub last_request_at: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ModelUsageDto {
    pub model: String,
    pub requests: i64,
    pub input_tokens: i64,
    pub output_tokens: i64,
    pub total_tokens: i64,
}

#[tauri::command]
pub async fn get_usage_summary(
    app: tauri::AppHandle,
    chat_id: Option<i64>,
    since: Option<String>,
) -> Result<UsageSummaryDto, String> {
    let desktop = app.state::<DesktopState>();
    let state = require_state(&desktop).await?;
    let summary = state
        .db
        .get_llm_usage_summary_since(chat_id, since.as_deref())
        .map_err(|e| e.to_string())?;
    Ok(UsageSummaryDto {
        requests: summary.requests,
        input_tokens: summary.input_tokens,
        output_tokens: summary.output_tokens,
        total_tokens: summary.total_tokens,
        last_request_at: summary.last_request_at,
    })
}

#[tauri::command]
pub async fn get_usage_by_model(
    app: tauri::AppHandle,
    chat_id: Option<i64>,
    since: Option<String>,
) -> Result<Vec<ModelUsageDto>, String> {
    let desktop = app.state::<DesktopState>();
    let state = require_state(&desktop).await?;
    let models = state
        .db
        .get_llm_usage_by_model(chat_id, since.as_deref(), Some(20))
        .map_err(|e| e.to_string())?;
    Ok(models
        .into_iter()
        .map(|m| ModelUsageDto {
            model: m.model,
            requests: m.requests,
            input_tokens: m.input_tokens,
            output_tokens: m.output_tokens,
            total_tokens: m.total_tokens,
        })
        .collect())
}

// ---------------------------------------------------------------------------
// Commands: Scheduler
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize)]
pub struct ScheduledTaskDto {
    pub id: i64,
    pub chat_id: i64,
    pub prompt: String,
    pub schedule_type: String,
    pub schedule_value: String,
    pub next_run: String,
    pub last_run: Option<String>,
    pub status: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct TaskRunLogDto {
    pub id: i64,
    pub task_id: i64,
    pub chat_id: i64,
    pub started_at: String,
    pub finished_at: String,
    pub duration_ms: i64,
    pub success: bool,
    pub result_summary: Option<String>,
}

#[tauri::command]
pub async fn list_scheduled_tasks(
    app: tauri::AppHandle,
    chat_id: i64,
) -> Result<Vec<ScheduledTaskDto>, String> {
    let desktop = app.state::<DesktopState>();
    let state = require_state(&desktop).await?;
    let tasks = state
        .db
        .get_tasks_for_chat(chat_id)
        .map_err(|e| e.to_string())?;
    Ok(tasks
        .into_iter()
        .map(|t| ScheduledTaskDto {
            id: t.id,
            chat_id: t.chat_id,
            prompt: t.prompt,
            schedule_type: t.schedule_type,
            schedule_value: t.schedule_value,
            next_run: t.next_run,
            last_run: t.last_run,
            status: t.status,
            created_at: t.created_at,
        })
        .collect())
}

#[tauri::command]
pub async fn update_task_status(
    app: tauri::AppHandle,
    task_id: i64,
    status: String,
) -> Result<bool, String> {
    let desktop = app.state::<DesktopState>();
    let state = require_state(&desktop).await?;
    // Only allow safe status transitions
    if !["active", "paused", "cancelled"].contains(&status.as_str()) {
        return Err(format!("Invalid status: {status}"));
    }
    state
        .db
        .update_task_status(task_id, &status)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_scheduled_task(
    app: tauri::AppHandle,
    task_id: i64,
) -> Result<bool, String> {
    let desktop = app.state::<DesktopState>();
    let state = require_state(&desktop).await?;
    state.db.delete_task(task_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_task_run_logs(
    app: tauri::AppHandle,
    task_id: i64,
) -> Result<Vec<TaskRunLogDto>, String> {
    let desktop = app.state::<DesktopState>();
    let state = require_state(&desktop).await?;
    let logs = state
        .db
        .get_task_run_logs(task_id, 50)
        .map_err(|e| e.to_string())?;
    Ok(logs
        .into_iter()
        .map(|l| TaskRunLogDto {
            id: l.id,
            task_id: l.task_id,
            chat_id: l.chat_id,
            started_at: l.started_at,
            finished_at: l.finished_at,
            duration_ms: l.duration_ms,
            success: l.success,
            result_summary: l.result_summary,
        })
        .collect())
}

// ---------------------------------------------------------------------------
// Commands: Dashboard
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize)]
pub struct TasksSummaryDto {
    pub total: usize,
    pub active: usize,
    pub paused: usize,
    pub completed: usize,
    pub cancelled: usize,
    pub runs_24h: usize,
    pub failures_24h: usize,
}

#[derive(Debug, Clone, Serialize)]
pub struct DbStatsDto {
    pub chats_count: usize,
    pub messages_count: usize,
    pub memories_count: usize,
    pub tasks_count: usize,
    pub db_size_bytes: u64,
}

#[derive(Debug, Clone, Serialize)]
pub struct DashboardMemoryDto {
    pub id: i64,
    pub chat_id: Option<i64>,
    pub content: String,
    pub category: String,
    pub confidence: f64,
    pub source: String,
    pub created_at: String,
    pub updated_at: String,
    pub last_seen_at: String,
    pub is_archived: bool,
    pub archived_at: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct DashboardTasksResultDto {
    pub total: usize,
    pub tasks: Vec<ScheduledTaskDto>,
}

#[derive(Debug, Clone, Serialize)]
pub struct DashboardMemoriesResultDto {
    pub total: usize,
    pub memories: Vec<DashboardMemoryDto>,
}

#[tauri::command]
pub async fn get_dashboard_tasks_summary(app: tauri::AppHandle) -> Result<TasksSummaryDto, String> {
    let desktop = app.state::<DesktopState>();
    let state = require_state(&desktop).await?;
    let summary = state.db.get_tasks_summary().map_err(|e| e.to_string())?;
    Ok(TasksSummaryDto {
        total: summary.total,
        active: summary.active,
        paused: summary.paused,
        completed: summary.completed,
        cancelled: summary.cancelled,
        runs_24h: summary.runs_24h,
        failures_24h: summary.failures_24h,
    })
}

#[tauri::command]
pub async fn get_dashboard_tasks(
    app: tauri::AppHandle,
    status: Option<String>,
    schedule_type: Option<String>,
    limit: Option<usize>,
    offset: Option<usize>,
) -> Result<DashboardTasksResultDto, String> {
    let desktop = app.state::<DesktopState>();
    let state = require_state(&desktop).await?;
    let limit = limit.unwrap_or(50).min(200);
    let offset = offset.unwrap_or(0);
    let (tasks, total) = state
        .db
        .get_all_tasks(
            status.as_deref(),
            schedule_type.as_deref(),
            limit,
            offset,
        )
        .map_err(|e| e.to_string())?;
    Ok(DashboardTasksResultDto {
        total,
        tasks: tasks
            .into_iter()
            .map(|t| ScheduledTaskDto {
                id: t.id,
                chat_id: t.chat_id,
                prompt: t.prompt,
                schedule_type: t.schedule_type,
                schedule_value: t.schedule_value,
                next_run: t.next_run,
                last_run: t.last_run,
                status: t.status,
                created_at: t.created_at,
            })
            .collect(),
    })
}

#[tauri::command]
pub async fn get_dashboard_memories(
    app: tauri::AppHandle,
    chat_id: Option<i64>,
    category: Option<String>,
    search: Option<String>,
    include_archived: Option<bool>,
    limit: Option<usize>,
    offset: Option<usize>,
) -> Result<DashboardMemoriesResultDto, String> {
    let desktop = app.state::<DesktopState>();
    let state = require_state(&desktop).await?;
    let limit = limit.unwrap_or(50).min(200);
    let offset = offset.unwrap_or(0);
    let include_archived = include_archived.unwrap_or(false);
    let (memories, total) = state
        .db
        .browse_memories(
            chat_id,
            category.as_deref(),
            include_archived,
            search.as_deref(),
            limit,
            offset,
        )
        .map_err(|e| e.to_string())?;
    Ok(DashboardMemoriesResultDto {
        total,
        memories: memories
            .into_iter()
            .map(|m| DashboardMemoryDto {
                id: m.id,
                chat_id: m.chat_id,
                content: m.content,
                category: m.category,
                confidence: m.confidence,
                source: m.source,
                created_at: m.created_at,
                updated_at: m.updated_at,
                last_seen_at: m.last_seen_at,
                is_archived: m.is_archived,
                archived_at: m.archived_at,
            })
            .collect(),
    })
}

#[tauri::command]
pub async fn get_db_stats(app: tauri::AppHandle) -> Result<DbStatsDto, String> {
    let desktop = app.state::<DesktopState>();
    let state = require_state(&desktop).await?;
    let stats = state.db.get_db_stats().map_err(|e| e.to_string())?;
    Ok(DbStatsDto {
        chats_count: stats.chats_count,
        messages_count: stats.messages_count,
        memories_count: stats.memories_count,
        tasks_count: stats.tasks_count,
        db_size_bytes: stats.db_size_bytes,
    })
}

/// Extract the body content from a SKILL.md (everything after the YAML frontmatter).
fn extract_skill_body(raw: &str) -> String {
    let trimmed = raw.trim_start_matches('\u{feff}');
    if let Some(rest) = trimmed.strip_prefix("---\n") {
        if let Some(end) = rest.find("\n---\n") {
            return rest[end + 5..].trim().to_string();
        }
        if let Some(end) = rest.find("\n---\r\n") {
            return rest[end + 6..].trim().to_string();
        }
    }
    trimmed.to_string()
}

#[tauri::command]
pub async fn new_chat(app: tauri::AppHandle) -> Result<i64, String> {
    let desktop = app.state::<DesktopState>();
    let state = require_state(&desktop).await?;
    let chat_id = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;
    state
        .db
        .upsert_chat(chat_id, Some("New Chat"), "desktop")
        .map_err(|e| e.to_string())?;
    Ok(chat_id)
}
