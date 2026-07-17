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
      title={saved ? "已收藏(再撳取消)" : "收藏,之後可以複習"}
      aria-label={saved ? "取消收藏" : "收藏"}
    >
      {saved ? "★" : "☆"}
    </button>
  );
}
