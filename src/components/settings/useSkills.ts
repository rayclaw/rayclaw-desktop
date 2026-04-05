import { useState, useCallback, useEffect } from "react";
import { listSkills, getSkill, saveSkill, deleteSkill } from "../../lib/tauri-api";
import type { SkillDto, SkillDetailDto } from "../../types";

export interface SkillForm {
  name: string;
  description: string;
  platforms: string;
  deps: string;
  content: string;
}

const emptyForm: SkillForm = { name: "", description: "", platforms: "", deps: "", content: "" };

export function useSkills(active: boolean) {
  const [skills, setSkills] = useState<SkillDto[]>([]);
  const [selectedSkill, setSelectedSkill] = useState<SkillDetailDto | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<SkillForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSkills = useCallback(() => {
    listSkills().then(setSkills).catch(() => {});
  }, []);

  useEffect(() => {
    if (active) fetchSkills();
  }, [active, fetchSkills]);

  const selectSkill = async (name: string) => {
    setError(null);
    setEditing(false);
    try {
      const detail = await getSkill(name);
      setSelectedSkill(detail);
    } catch (e) {
      setError(String(e));
    }
  };

  const startNew = () => {
    setSelectedSkill(null);
    setEditing(true);
    setForm(emptyForm);
    setError(null);
  };

  const startEdit = () => {
    if (!selectedSkill) return;
    setEditing(true);
    setForm({
      name: selectedSkill.meta.name,
      description: selectedSkill.meta.description,
      platforms: selectedSkill.meta.platforms.join(", "),
      deps: selectedSkill.meta.deps.join(", "),
      content: selectedSkill.content,
    });
    setError(null);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const platforms = form.platforms.split(",").map((s) => s.trim()).filter(Boolean);
      const deps = form.deps.split(",").map((s) => s.trim()).filter(Boolean);
      await saveSkill(form.name, form.description, platforms, deps, form.content);
      setEditing(false);
      fetchSkills();
      const detail = await getSkill(form.name);
      setSelectedSkill(detail);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (name: string) => {
    if (!window.confirm(`Delete skill "${name}"? This cannot be undone.`)) return;
    setError(null);
    try {
      await deleteSkill(name);
      setSelectedSkill(null);
      setEditing(false);
      fetchSkills();
    } catch (e) {
      setError(String(e));
    }
  };

  const cancelEdit = () => setEditing(false);

  return {
    skills,
    selectedSkill,
    editing,
    form,
    setForm,
    saving,
    error,
    fetchSkills,
    selectSkill,
    startNew,
    startEdit,
    save,
    remove,
    cancelEdit,
  };
}
