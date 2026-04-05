import { useState, useCallback, useEffect } from "react";
import { readSoul, saveSoul } from "../../lib/tauri-api";

export function useSoul(active: boolean) {
  const [content, setContent] = useState("");
  const [original, setOriginal] = useState("");
  const [path, setPath] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const fetch = useCallback(() => {
    readSoul().then((s) => {
      setContent(s.content);
      setOriginal(s.content);
      setPath(s.path);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (active) fetch();
  }, [active, fetch]);

  const save = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await saveSoul(content);
      setOriginal(content);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  const dirty = content !== original;

  return { content, setContent, path, saving, saved, setSaved, dirty, save };
}
