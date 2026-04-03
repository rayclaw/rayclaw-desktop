import { useState, useEffect, useCallback } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import Sidebar from "./components/Sidebar";
import ChatWindow from "./components/ChatWindow";
import SetupScreen from "./components/SetupScreen";
import SettingsPage from "./components/SettingsPage";
import DashboardPage from "./components/DashboardPage";
import { getStatus, getChats, newChat, exportChatMarkdown } from "./lib/tauri-api";
import type { AppStatus, ChatSummary } from "./types";
import "./App.css";

type View = "chat" | "settings" | "dashboard";

function loadPinnedIds(): Set<number> {
  try {
    const raw = localStorage.getItem("rayclaw-pinned-chats");
    if (raw) return new Set(JSON.parse(raw));
  } catch { /* ignore */ }
  return new Set();
}

function savePinnedIds(ids: Set<number>) {
  localStorage.setItem("rayclaw-pinned-chats", JSON.stringify([...ids]));
}

function App() {
  const [status, setStatus] = useState<AppStatus | null>(null);
  const [view, setView] = useState<View>("chat");
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [activeChatId, setActiveChatId] = useState<number | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem("rayclaw-sidebar-width");
    return saved ? Number(saved) : 280;
  });
  const [pinnedChatIds, setPinnedChatIds] = useState<Set<number>>(loadPinnedIds);
  const [chatSearchOpen, setChatSearchOpen] = useState(false);

  const refreshStatus = useCallback(() => {
    getStatus().then(setStatus);
  }, []);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  const loadChats = useCallback(async () => {
    if (!status?.ready) return;
    const chatList = await getChats();
    setChats(chatList);
  }, [status?.ready]);

  useEffect(() => {
    loadChats();
  }, [loadChats]);

  const handleNewChat = async () => {
    const chatId = await newChat();
    setActiveChatId(chatId);
    await loadChats();
  };

  const handleSelectChat = (chatId: number) => {
    setActiveChatId(chatId);
  };

  const handleSettingsSaved = () => {
    refreshStatus();
  };

  const togglePin = (chatId: number) => {
    setPinnedChatIds((prev) => {
      const next = new Set(prev);
      if (next.has(chatId)) next.delete(chatId);
      else next.add(chatId);
      savePinnedIds(next);
      return next;
    });
  };

  const handleExportChat = async (chatId: number) => {
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

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;

      // Cmd+N: new chat
      if (mod && e.key === "n") {
        e.preventDefault();
        handleNewChat();
        return;
      }

      // Cmd+K: search chats (handled by Sidebar, but also ensure sidebar search opens)
      // Left to Sidebar's handler

      // Cmd+,: open settings
      if (mod && e.key === ",") {
        e.preventDefault();
        setView("settings");
        return;
      }

      // Cmd+D: open dashboard
      if (mod && e.key === "d") {
        e.preventDefault();
        setView("dashboard");
        return;
      }

      // Cmd+F: search in chat
      if (mod && e.key === "f") {
        e.preventDefault();
        if (activeChatId !== null && view === "chat") {
          setChatSearchOpen(true);
        }
        return;
      }

      // Cmd+E: export current chat
      if (mod && e.key === "e") {
        e.preventDefault();
        if (activeChatId !== null) {
          handleExportChat(activeChatId);
        }
        return;
      }

      // Escape: close search / settings
      if (e.key === "Escape") {
        if (chatSearchOpen) {
          setChatSearchOpen(false);
          return;
        }
        if (view === "settings" || view === "dashboard") {
          setView("chat");
          return;
        }
      }

      // Up/Down: switch chats when input empty
      if ((e.key === "ArrowUp" || e.key === "ArrowDown") && !mod && view === "chat") {
        const textarea = document.querySelector(".chat-input") as HTMLTextAreaElement | null;
        const isInputFocused = document.activeElement === textarea;
        const isInputEmpty = !textarea?.value;
        if (isInputFocused && isInputEmpty && chats.length > 0) {
          e.preventDefault();
          const currentIndex = chats.findIndex((c) => c.chat_id === activeChatId);
          const nextIndex =
            e.key === "ArrowUp"
              ? Math.max(0, currentIndex - 1)
              : Math.min(chats.length - 1, currentIndex + 1);
          if (chats[nextIndex]) {
            setActiveChatId(chats[nextIndex].chat_id);
          }
        }
      }
    };

    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [activeChatId, view, chatSearchOpen, chats]);

  // Loading
  if (status === null) {
    return (
      <div className="app-layout">
        <div className="setup-screen">
          <p style={{ color: "var(--muted)" }}>Loading...</p>
        </div>
      </div>
    );
  }

  // Not configured — show setup screen (or settings if user clicked Configure)
  if (!status.ready && view !== "settings") {
    return (
      <SetupScreen
        error={status.error}
        onConfigure={() => setView("settings")}
      />
    );
  }

  // Settings page (accessible from setup screen or sidebar)
  if (view === "settings") {
    return (
      <SettingsPage
        onBack={() => setView("chat")}
        onSaved={handleSettingsSaved}
      />
    );
  }

  // Dashboard page
  if (view === "dashboard") {
    return (
      <DashboardPage
        onBack={() => setView("chat")}
      />
    );
  }

  return (
    <div className="app-layout">
      <Sidebar
        chats={chats}
        activeChatId={activeChatId}
        onSelectChat={handleSelectChat}
        onNewChat={handleNewChat}
        onOpenSettings={() => setView("settings")}
        onOpenDashboard={() => setView("dashboard")}
        onChatDeleted={() => {
          setActiveChatId(null);
          loadChats();
        }}
        width={sidebarWidth}
        onWidthChange={(w) => {
          setSidebarWidth(w);
          localStorage.setItem("rayclaw-sidebar-width", String(w));
        }}
        pinnedChatIds={pinnedChatIds}
        onTogglePin={togglePin}
      />
      <ChatWindow
        chatId={activeChatId}
        chatTitle={chats.find((c) => c.chat_id === activeChatId)?.chat_title ?? null}
        chatType={chats.find((c) => c.chat_id === activeChatId)?.chat_type}
        onNewChat={handleNewChat}
        onOpenSettings={() => setView("settings")}
        onTitleChanged={loadChats}
        searchOpen={chatSearchOpen}
        onSearchClose={() => setChatSearchOpen(false)}
      />
    </div>
  );
}

export default App;
