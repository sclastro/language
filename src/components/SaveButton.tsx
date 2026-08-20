"use client";

import {
  useSaved,
  toggleSavedByText,
  type SavedKind,
  type SavedExtra,
} from "@/lib/savedStore";

export default function SaveButton({
  text,
  kind,
  original,
  explanation,
}: {
  text: string;
  kind: SavedKind;
  /** 你當時寫錯的版本 —— 存低它,複習時才有題目可出。 */
  original?: string;
  explanation?: string;
}) {
  const { items } = useSaved();
  const saved = items.some((i) => i.text === text.trim());
  const extra: SavedExtra = { original, explanation };

  return (
    <button
      type="button"
      className={`saver ${saved ? "on" : ""}`}
      onClick={() => toggleSavedByText(text, kind, extra)}
      title={saved ? "Saved (tap to remove)" : "Save for later review"}
      aria-label={saved ? "Remove from saved" : "Save"}
    >
      {saved ? "★" : "☆"}
    </button>
  );
}
