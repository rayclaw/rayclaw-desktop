import { useState, useCallback, useEffect } from "react";
import { listMemories, searchMemories, updateMemory, archiveMemory, deleteMemory, getMemoryObservability } from "../../lib/tauri-api";
import type { MemoryDto, MemoryObservabilityDto } from "../../types";

export function useMemories(active: boolean) {
  const [memories, setMemories] = useState<MemoryDto[]>([]);
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [obs, setObs] = useState<MemoryObservabilityDto | null>(null);
  const [editingMemory, setEditingMemory] = useState<MemoryDto | null>(null);
  const [editContent, setEditContent] = useState("");
  const [editCategory, setEditCategory] = useState("");

  const fetchMemories = useCallback(() => {
    if (search.trim()) {
      searchMemories(0, search, showArchived).then(setMemories).catch(() => {});
    } else {
      listMemories().then((all) => {
        setMemories(showArchived ? all : all.filter((m) => !m.is_archived));
      }).catch(() => {});
    }
  }, [search, showArchived]);

  const fetchObs = useCallback(() => {
    getMemoryObservability().then(setObs).catch(() => {});
  }, []);

  useEffect(() => {
    if (active) {
      fetchMemories();
      fetchObs();
    }
  }, [active, fetchMemories, fetchObs]);

  const startEdit = (m: MemoryDto) => {
    setEditingMemory(m);
    setEditContent(m.content);
    setEditCategory(m.category);
  };

  const saveEdit = async () => {
    if (!editingMemory) return;
    await updateMemory(editingMemory.id, editContent, editCategory).catch(() => {});
    setEditingMemory(null);
    fetchMemories();
  };

  const cancelEdit = () => setEditingMemory(null);

  const archive = async (id: number) => {
    await archiveMemory(id).catch(() => {});
    fetchMemories();
    fetchObs();
  };

  const remove = async (id: number) => {
    if (!window.confirm("Permanently delete this memory?")) return;
    await deleteMemory(id).catch(() => {});
    fetchMemories();
    fetchObs();
  };

  return {
    memories,
    search,
    setSearch,
    showArchived,
    setShowArchived,
    obs,
    editingMemory,
    editContent,
    setEditContent,
    editCategory,
    setEditCategory,
    fetchMemories,
    startEdit,
    saveEdit,
    cancelEdit,
    archive,
    remove,
  };
}
