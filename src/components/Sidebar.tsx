import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { MoreHorizontal, FileDown, Trash2, Search, X, Pin } from "lucide-react";
import { save, confirm } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import type { ChatSummary } from "../types";
import { channelLabel, inferChannel } from "../types";
import { deleteChat, exportChatMarkdown } from "../lib/tauri-api";

interface SidebarProps {
  chats: ChatSummary[];
  activeChatId: number | null;
  onSelectChat: (chatId: number) => void;
  onNewChat: () => void;
  onOpenSettings: () => void;
  onOpenDashboard: () => void;
  onChatDeleted: () => void;
  width: number;
  onWidthChange: (w: number) => void;
  pinnedChatIds?: Set<number>;
  onTogglePin?: (chatId: number) => void;
}

function relativeTime(isoString: string): string {
  const now = Date.now();
  const then = new Date(isoString).getTime();
  const diff = now - then;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  const d = new Date(isoString);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function Sidebar({
  chats,
  activeChatId,
  onSelectChat,
  onNewChat,
  onOpenSettings,
  onOpenDashboard,
  onChatDeleted,
  width,
  onWidthChange,
  pinnedChatIds,
  onTogglePin,
}: SidebarProps) {
  const [menuChatId, setMenuChatId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Resize handle drag logic
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = width;
    const onMove = (ev: MouseEvent) => {
      const newW = Math.min(400, Math.max(200, startW + ev.clientX - startX));
      onWidthChange(newW);
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [width, onWidthChange]);

  // Close menu on click outside
  useEffect(() => {
    if (menuChatId === null) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuChatId(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuChatId]);

  // Focus search on open
  useEffect(() => {
    if (searchOpen) searchRef.current?.focus();
  }, [searchOpen]);

  // Keyboard shortcut: Cmd/Ctrl+K to open search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
      if (e.key === "Escape" && searchOpen) {
        setSearchOpen(false);
        setSearchQuery("");
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [searchOpen]);

  const filteredChats = useMemo(() => {
    if (!searchQuery.trim()) return chats;
    const q = searchQuery.toLowerCase();
    return chats.filter((c) => {
      const title = (c.chat_title || "").toLowerCase();
      const preview = (c.last_message_preview || "").toLowerCase();
      const channel = inferChannel(c.chat_type);
      return title.includes(q) || preview.includes(q) || channel.includes(q);
    });
  }, [chats, searchQuery]);

  const toggleMenu = (e: React.MouseEvent, chatId: number) => {
    e.stopPropagation();
    setMenuChatId(menuChatId === chatId ? null : chatId);
  };

  const handleDelete = async (chatId: number) => {
    setMenuChatId(null);
    try {
      const ok = await confirm("Are you sure you want to delete this chat? This action cannot be undone.", {
        title: "Delete Chat",
        kind: "warning",
      });
      if (!ok) return;
      await deleteChat(chatId);
      onChatDeleted();
    } catch (err) {
      console.error("Failed to delete chat:", err);
    }
  };

  const handleExport = async (chatId: number) => {
    setMenuChatId(null);
    try {
      const chat = chats.find((c) => c.chat_id === chatId);
      const defaultName = (chat?.chat_title || `chat-${chatId}`).replace(/[^a-zA-Z0-9_-]/g, "_") + ".md";

      const filePath = await save({
        defaultPath: defaultName,
        filters: [{ name: "Markdown", extensions: ["md"] }],
      });
      if (!filePath) return;

      const md = await exportChatMarkdown(chatId);
      await writeTextFile(filePath, md);
    } catch (err) {
      console.error("Failed to export chat:", err);
    }
  };

  // Split into pinned + grouped for rendering
  const pinned = pinnedChatIds ? filteredChats.filter((c) => pinnedChatIds.has(c.chat_id)) : [];
  const unpinned = pinnedChatIds ? filteredChats.filter((c) => !pinnedChatIds.has(c.chat_id)) : filteredChats;

  // Group unpinned by channel
  const grouped = useMemo(() => {
    const map = new Map<string, ChatSummary[]>();
    for (const c of unpinned) {
      const ch = inferChannel(c.chat_type);
      if (!map.has(ch)) map.set(ch, []);
      map.get(ch)!.push(c);
    }
    return map;
  }, [unpinned]);

  const showGroupHeaders = grouped.size > 1;

  const renderChatItem = (chat: ChatSummary) => {
    const badge = channelLabel(chat.chat_type);
    const isMenuOpen = menuChatId === chat.chat_id;
    const timeLabel = relativeTime(chat.last_message_time);
    const isPinned = pinnedChatIds?.has(chat.chat_id);
    return (
      <div
        key={chat.chat_id}
        className={`sidebar-item ${chat.chat_id === activeChatId ? "sidebar-item-active" : ""}`}
        onClick={() => onSelectChat(chat.chat_id)}
      >
        <div className="sidebar-item-row">
          <div className="sidebar-item-title">
            {badge && <span className="channel-badge">{badge}</span>}
            {chat.chat_title || `Chat ${chat.chat_id}`}
          </div>
          <span className="sidebar-item-time">{timeLabel}</span>
          <button
            className="sidebar-item-more"
            onClick={(e) => toggleMenu(e, chat.chat_id)}
            title="More"
          >
            <MoreHorizontal size={14} />
          </button>
        </div>
        {chat.last_message_preview && (
          <div className="sidebar-item-preview">
            {chat.last_message_preview.slice(0, 60)}
          </div>
        )}

        {isMenuOpen && (
          <div ref={menuRef} className="sidebar-dropdown" onClick={(e) => e.stopPropagation()}>
            {onTogglePin && (
              <button
                className="sidebar-dropdown-item"
                onClick={() => { onTogglePin(chat.chat_id); setMenuChatId(null); }}
              >
                <Pin size={14} />
                {isPinned ? "Unpin" : "Pin to top"}
              </button>
            )}
            <button
              className="sidebar-dropdown-item"
              onClick={() => handleExport(chat.chat_id)}
            >
              <FileDown size={14} />
              Export as Markdown
            </button>
            <button
              className="sidebar-dropdown-item sidebar-dropdown-danger"
              onClick={() => handleDelete(chat.chat_id)}
            >
              <Trash2 size={14} />
              Delete Chat
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <aside className="sidebar" style={{ width, minWidth: width }}>
      <div className="sidebar-header">
        <h2>RayClaw</h2>
        <div className="sidebar-header-actions">
          <button
            className="btn-icon"
            onClick={() => { setSearchOpen(!searchOpen); if (searchOpen) setSearchQuery(""); }}
            title="Search (Ctrl+K)"
          >
            <Search size={15} />
          </button>
          <button className="btn-new-chat" onClick={onNewChat} title="New Chat">
            +
          </button>
        </div>
      </div>

      {/* Search bar */}
      {searchOpen && (
        <div className="sidebar-search">
          <input
            ref={searchRef}
            className="sidebar-search-input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search chats..."
          />
          {searchQuery && (
            <button className="sidebar-search-clear" onClick={() => setSearchQuery("")}>
              <X size={14} />
            </button>
          )}
        </div>
      )}

      <div className="sidebar-list">
        {/* Pinned section */}
        {pinned.length > 0 && (
          <>
            <div className="sidebar-group-header">Pinned</div>
            {pinned.map(renderChatItem)}
          </>
        )}

        {/* Grouped unpinned */}
        {showGroupHeaders
          ? Array.from(grouped.entries()).map(([channel, items]) => (
              <div key={channel}>
                <div className="sidebar-group-header">{channel}</div>
                {items.map(renderChatItem)}
              </div>
            ))
          : unpinned.map(renderChatItem)
        }

        {filteredChats.length === 0 && chats.length > 0 && (
          <div className="sidebar-empty">No matching chats</div>
        )}
        {chats.length === 0 && (
          <div className="sidebar-empty">No chats yet. Start a new one!</div>
        )}
      </div>
      <div className="sidebar-footer">
        <button className="btn-dashboard" onClick={onOpenDashboard}>
          Dashboard
        </button>
        <button className="btn-settings" onClick={onOpenSettings}>
          Settings
        </button>
      </div>
      <div className="sidebar-resize-handle" onMouseDown={handleResizeStart} />
    </aside>
  );
}
