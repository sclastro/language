"use client";

import { useSaved, toggleSavedByText, type SavedKind } from "@/lib/savedStore";

export default function SaveButton({
  text,
  kind,
}: {
  text: string;
  kind: SavedKind;
}) {
  const { items } = useSaved();
  const saved = items.some((i) => i.text === text.trim());

  return (
    <button
      type="button"
      className={`saver ${saved ? "on" : ""}`}
      onClick={() => toggleSavedByText(text, kind)}
      title={saved ? "Saved (tap to remove)" : "Save for later review"}
      aria-label={saved ? "Remove from saved" : "Save"}
    >
      {saved ? "★" : "☆"}
    </button>
  );
}
