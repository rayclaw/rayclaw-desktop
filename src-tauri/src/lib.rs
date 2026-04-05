mod commands;
mod state;

use std::sync::Arc;

use rayclaw::channel_adapter::ChannelRegistry;
use rayclaw::config::Config;
use rayclaw::runtime::AppState;
use state::DesktopState;
use tauri::Manager;
use tokio::sync::RwLock;
use tracing::{error, info, warn};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn expand_tilde(path: &str) -> String {
    let home = std::env::var("HOME").unwrap_or_else(|_| ".".into());
    if let Some(rest) = path.strip_prefix("~/") {
        format!("{home}/{rest}")
    } else if path == "~" {
        home
    } else {
        path.to_string()
    }
}

/// Ensure RAYCLAW_CONFIG env var is set to ~/.rayclaw/rayclaw.config.yaml
/// if it doesn't already exist AND the file exists. This ensures the Desktop app
/// finds the config regardless of the current working directory (which varies
/// between dev and release). If the file doesn't exist yet, we leave the env
/// unset so the app shows the setup screen.
fn ensure_config_env() {
    if std::env::var("RAYCLAW_CONFIG").is_ok() {
        return; // Already set, respect user override
    }
    let home = std::env::var("HOME").unwrap_or_else(|_| ".".into());
    let config_path = format!("{home}/.rayclaw/rayclaw.config.yaml");
    if std::path::Path::new(&config_path).exists() {
        // SAFETY: Called at app startup before any threads are spawned
        unsafe { std::env::set_var("RAYCLAW_CONFIG", &config_path) };
    }
}

fn init_logging() {
    use tracing_subscriber::{fmt, layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

    let home = std::env::var("HOME").unwrap_or_else(|_| ".".into());
    let log_dir = format!("{home}/.rayclaw/logs");
    let _ = std::fs::create_dir_all(&log_dir);

    let file_appender = tracing_appender::rolling::daily(&log_dir, "rayclaw-desktop.log");
    let (file_writer, _guard) = tracing_appender::non_blocking(file_appender);
    // Leak guard so it lives for the process lifetime
    std::mem::forget(_guard);

    let filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new("info,rayclaw=debug,rayclaw_desktop=debug"));

    tracing_subscriber::registry()
        .with(filter)
        .with(
            fmt::layer()
                .with_target(true)
                .with_ansi(true)
                .with_writer(std::io::stderr),
        )
        .with(
            fmt::layer()
                .with_target(true)
                .with_ansi(false)
                .with_writer(file_writer),
        )
        .init();

    info!("Logging initialized — file: {log_dir}/rayclaw-desktop.log.*");
}

// ---------------------------------------------------------------------------
// Channel synthesis (mirrors post_deserialize for legacy flat fields)
// ---------------------------------------------------------------------------

/// Populate `config.channels` map from legacy flat fields if not already set.
/// This mirrors what `Config::post_deserialize()` does internally.
fn synthesize_channels(config: &mut Config) {
    // Telegram: legacy flat fields → channels map
    if !config.channels.contains_key("telegram") && !config.telegram_bot_token.trim().is_empty() {
        let val = serde_yaml::to_value(serde_json::json!({
            "bot_token": config.telegram_bot_token,
            "bot_username": config.bot_username,
            "allowed_groups": config.allowed_groups,
        }))
        .unwrap();
        config.channels.insert("telegram".into(), val);
        info!("Synthesized telegram channel config from legacy fields");
    }

    // Discord: legacy flat field → channels map
    if !config.channels.contains_key("discord") {
        if let Some(ref token) = config.discord_bot_token {
            if !token.trim().is_empty() {
                let val = serde_yaml::to_value(serde_json::json!({
                    "bot_token": token,
                    "allowed_channels": config.discord_allowed_channels,
                }))
                .unwrap();
                config.channels.insert("discord".into(), val);
                info!("Synthesized discord channel config from legacy fields");
            }
        }
    }

    // Web: legacy flat fields → channels map
    if !config.channels.contains_key("web") && config.web_enabled {
        let val = serde_yaml::to_value(serde_json::json!({
            "enabled": true,
            "host": config.web_host,
            "port": config.web_port,
            "auth_token": config.web_auth_token,
        }))
        .unwrap();
        config.channels.insert("web".into(), val);
    }
}

// ---------------------------------------------------------------------------
// Full agent + channel initialization
// ---------------------------------------------------------------------------

/// Initialize the full agent (DB, memory, skills, MCP, ACP, LLM, tools)
/// with channel adapters registered and ready to start.
pub(crate) async fn init_agent(
    mut config: Config,
) -> Result<Arc<AppState>, String> {
    config.validate_for_sdk().map_err(|e| format!("Config validation: {e}"))?;

    // Expand tilde in paths
    if config.data_dir.starts_with("~/") {
        config.data_dir = expand_tilde(&config.data_dir);
    }
    if config.working_dir.starts_with("~/") {
        config.working_dir = expand_tilde(&config.working_dir);
    }

    // Synthesize channels map from legacy fields
    synthesize_channels(&mut config);

    let data_root_dir = config.data_root_dir();
    let runtime_data_dir = config.runtime_data_dir();
    let skills_data_dir = config.skills_data_dir();

    rayclaw::builtin_skills::ensure_builtin_skills(&data_root_dir)
        .map_err(|e| format!("Builtin skills: {e}"))?;
    rayclaw::builtin_skills::ensure_default_soul(&data_root_dir)
        .map_err(|e| format!("Default soul: {e}"))?;

    let db = Arc::new(
        rayclaw::db::Database::new(&runtime_data_dir).map_err(|e| format!("Database: {e}"))?,
    );
    info!("Database initialized at {runtime_data_dir}");

    let memory = rayclaw::memory::MemoryManager::new(&runtime_data_dir);
    let skill_manager = rayclaw::skills::SkillManager::from_skills_dir(&skills_data_dir);
    let discovered = skill_manager.discover_skills();
    info!("{} skills discovered", discovered.len());

    let mcp_path = data_root_dir.join("mcp.json").to_string_lossy().to_string();
    let mcp_manager = rayclaw::mcp::McpManager::from_config_file(&mcp_path).await;
    let mcp_tools = mcp_manager.all_tools().len();
    if mcp_tools > 0 {
        info!("MCP: {mcp_tools} tools");
    }

    let acp_path = data_root_dir.join("acp.json").to_string_lossy().to_string();
    let acp_manager = rayclaw::acp::AcpManager::from_config_file(&acp_path);

    // Build channel registry
    let mut registry = ChannelRegistry::new();
    register_channels(&config, &mut registry);
    let channel_registry = Arc::new(registry);

    // Update runtime config data_dir to the runtime directory
    let mut runtime_config = config.clone();
    runtime_config.data_dir = runtime_data_dir;

    // Create AppState with FULL tools (not SDK-restricted) so channels work
    let state = rayclaw::runtime::create_app_state(
        runtime_config,
        db,
        channel_registry,
        memory,
        skill_manager,
        mcp_manager,
        acp_manager,
        false, // full tools — channels need send_message, schedule, sub_agent
    )
    .await
    .map_err(|e| format!("AppState: {e}"))?;

    info!("Agent initialized (full mode with channel support)");
    Ok(state)
}

/// Register configured channel adapters into the registry.
fn register_channels(config: &Config, registry: &mut ChannelRegistry) {
    use rayclaw::channels::*;

    // Telegram
    if let Some(tg_cfg) =
        config.channel_config::<rayclaw::channels::telegram::TelegramChannelConfig>("telegram")
    {
        if !tg_cfg.bot_token.trim().is_empty() {
            let bot = teloxide::Bot::new(&tg_cfg.bot_token);
            registry.register(Arc::new(TelegramAdapter::new(bot, tg_cfg)));
            info!("Registered channel: telegram");
        }
    }

    // Discord
    if let Some(dc_cfg) =
        config.channel_config::<rayclaw::channels::discord::DiscordChannelConfig>("discord")
    {
        if !dc_cfg.bot_token.trim().is_empty() {
            registry.register(Arc::new(DiscordAdapter::new(dc_cfg.bot_token)));
            info!("Registered channel: discord");
        }
    }

    // Slack
    if let Some(slack_cfg) =
        config.channel_config::<rayclaw::channels::slack::SlackChannelConfig>("slack")
    {
        if !slack_cfg.bot_token.trim().is_empty() && !slack_cfg.app_token.trim().is_empty() {
            registry.register(Arc::new(SlackAdapter::new(slack_cfg.bot_token)));
            info!("Registered channel: slack");
        }
    }

    // Feishu
    if let Some(feishu_cfg) =
        config.channel_config::<rayclaw::channels::feishu::FeishuChannelConfig>("feishu")
    {
        if !feishu_cfg.app_id.trim().is_empty() && !feishu_cfg.app_secret.trim().is_empty() {
            registry.register(Arc::new(FeishuAdapter::new(
                feishu_cfg.app_id.clone(),
                feishu_cfg.app_secret.clone(),
                feishu_cfg.domain.clone(),
            )));
            info!("Registered channel: feishu (domain={}, mode={})",
                feishu_cfg.domain, feishu_cfg.connection_mode);
        } else {
            warn!("Feishu channel: app_id or app_secret is empty — skipping");
        }
    }
}

/// Try to start a single channel adapter. Returns a JoinHandle if successful.
pub(crate) fn start_single_channel(
    name: &str,
    state: &Arc<AppState>,
    rt: &tokio::runtime::Handle,
) -> Option<tokio::task::JoinHandle<()>> {
    let config = &state.config;

    match name {
        "telegram" => {
            let tg_cfg = config
                .channel_config::<rayclaw::channels::telegram::TelegramChannelConfig>("telegram")?;
            if tg_cfg.bot_token.trim().is_empty() {
                return None;
            }
            let s = state.clone();
            let bot = teloxide::Bot::new(&tg_cfg.bot_token);
            info!("Starting Telegram bot");
            Some(rt.spawn(async move {
                if let Err(e) = rayclaw::telegram::start_telegram_bot(s, bot).await {
                    error!("Telegram bot exited: {e}");
                }
            }))
        }
        "discord" => {
            let dc_cfg = config
                .channel_config::<rayclaw::channels::discord::DiscordChannelConfig>("discord")?;
            if dc_cfg.bot_token.trim().is_empty() {
                return None;
            }
            let s = state.clone();
            let token = dc_cfg.bot_token.clone();
            info!("Starting Discord bot");
            Some(rt.spawn(async move {
                rayclaw::discord::start_discord_bot(s, &token).await;
            }))
        }
        "slack" => {
            let slack_cfg = config
                .channel_config::<rayclaw::channels::slack::SlackChannelConfig>("slack")?;
            if slack_cfg.bot_token.trim().is_empty() || slack_cfg.app_token.trim().is_empty() {
                return None;
            }
            let s = state.clone();
            info!("Starting Slack bot (Socket Mode)");
            Some(rt.spawn(async move {
                rayclaw::channels::slack::start_slack_bot(s).await;
            }))
        }
        "feishu" => {
            let feishu_cfg = config
                .channel_config::<rayclaw::channels::feishu::FeishuChannelConfig>("feishu")?;
            if feishu_cfg.app_id.trim().is_empty() || feishu_cfg.app_secret.trim().is_empty() {
                return None;
            }
            let s = state.clone();
            info!(
                "Starting Feishu bot (domain={}, mode={})",
                feishu_cfg.domain, feishu_cfg.connection_mode
            );
            Some(rt.spawn(async move {
                rayclaw::channels::feishu::start_feishu_bot(s).await;
            }))
        }
        _ => {
            warn!("Unknown channel: {name}");
            None
        }
    }
}

/// Spawn channel adapter tasks on the given runtime, respecting enabled state.
/// Returns named handles for cleanup.
pub(crate) fn start_channels(
    state: &Arc<AppState>,
    rt: &tokio::runtime::Handle,
    enabled: &std::collections::HashMap<String, bool>,
) -> std::collections::HashMap<String, tokio::task::JoinHandle<()>> {
    let mut handles = std::collections::HashMap::new();

    for name in &["telegram", "discord", "slack", "feishu"] {
        // Default to true (start) if no explicit enabled entry
        let is_enabled = enabled.get(*name).copied().unwrap_or(true);
        if !is_enabled {
            info!("Channel {name} disabled by user — skipping");
            continue;
        }
        if let Some(handle) = start_single_channel(name, state, rt) {
            handles.insert(name.to_string(), handle);
        }
    }

    if handles.is_empty() {
        info!("No channel adapters to start");
    } else {
        info!("{} channel adapter(s) started", handles.len());
    }
    handles
}

// ---------------------------------------------------------------------------
// Tauri app entry
// ---------------------------------------------------------------------------

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    ensure_config_env();
    init_logging();
    info!("RayClaw Desktop v{} starting", env!("CARGO_PKG_VERSION"));

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            let rt = tokio::runtime::Runtime::new().expect("failed to create tokio runtime");

            let channel_enabled = state::load_channel_enabled();

            let (app_state, init_error, handles) = rt.block_on(async {
                info!("Loading config...");
                match Config::load() {
                    Ok(config) => {
                        info!(
                            "Config loaded: provider={}, model={}, data_dir={}",
                            config.llm_provider, config.model, config.data_dir
                        );
                        match init_agent(config).await {
                            Ok(state) => {
                                let h = start_channels(&state, &tokio::runtime::Handle::current(), &channel_enabled);
                                (Some(state), None, h)
                            }
                            Err(e) => {
                                error!("Agent init failed: {e}");
                                (None, Some(e), std::collections::HashMap::new())
                            }
                        }
                    }
                    Err(e) => {
                        info!("No config found ({e}) — showing setup screen");
                        (None, None, std::collections::HashMap::new())
                    }
                }
            });

            app.manage(DesktopState {
                app_state: RwLock::new(app_state),
                init_error: RwLock::new(init_error),
                runtime: rt,
                channel_handles: std::sync::Mutex::new(handles),
                channel_enabled: std::sync::Mutex::new(channel_enabled),
            });

            info!("Tauri setup complete");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_status,
            commands::get_config,
            commands::save_config,
            commands::get_channel_status,
            commands::toggle_channel,
            commands::send_message,
            commands::get_history,
            commands::get_chats,
            commands::reset_session,
            commands::new_chat,
            commands::rename_chat,
            commands::delete_chat,
            commands::export_chat_markdown,
            commands::read_soul,
            commands::save_soul,
            commands::list_skills,
            commands::get_skill,
            commands::save_skill,
            commands::delete_skill,
            // Memory management
            commands::list_memories,
            commands::search_memories,
            commands::update_memory,
            commands::archive_memory,
            commands::delete_memory,
            commands::get_memory_observability,
            // Usage analytics
            commands::get_usage_summary,
            commands::get_usage_by_model,
            // Scheduler
            commands::list_scheduled_tasks,
            commands::update_task_status,
            commands::delete_scheduled_task,
            commands::get_task_run_logs,
            // Dashboard
            commands::get_dashboard_tasks_summary,
            commands::get_dashboard_tasks,
            commands::get_dashboard_memories,
            commands::get_db_stats,
            // MCP configuration
            commands::get_mcp_config,
            commands::save_mcp_config,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
