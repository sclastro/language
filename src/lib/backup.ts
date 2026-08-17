"use client";

/**
 * 備份檔的組裝與還原。
 *
 * 特意放喺獨立模組(而唔係頁面組件入面),因為備份係「保命」功能,一定要有測試。
 * 之前有過一個 bug:匯入備份掉失咗 srs/meaning/example,單靠數項目數量係捉唔到的。
 * 而對話一直完全冇備份到 —— 換機就冇晒。
 */

import {
  exportSavedJson,
  importSavedItems,
  mergeTombstones,
  type SavedItem,
  type Tombstones,
} from "./savedStore";
import {
  getSyncableConvos,
  getConvoTombstones,
  mergeConvoTombstones,
  mergeInConvos,
  type Convo,
  type ConvoTombstones,
} from "./convoStore";

export type Backup = {
  version: number;
  exportedAt: number;
  items: SavedItem[];
  tombstones: Tombstones;
  convos: Convo[];
  convoTombstones: ConvoTombstones;
};

/** 匯出:收藏 + 對話 + 兩者的刪除記錄。 */
export function buildBackup(): Backup {
  const base = JSON.parse(exportSavedJson()) as Omit<Backup, "convos" | "convoTombstones">;
  return {
    ...base,
    version: 3,
    // 備份唔設上限(同步先要慳 payload)
    convos: getSyncableConvos(Infinity),
    convoTombstones: getConvoTombstones(),
  };
}

export function buildBackupJson(): string {
  return JSON.stringify(buildBackup(), null, 2);
}

export type RestoreResult = { items: number; convos: number };

/**
 * 還原:接受 v1(純陣列)、v2(items + tombstones)同 v3(再加 convos)。
 * 回傳實際新增/更新咗幾多項,方便向用戶交代。
 */
export function restoreBackup(parsed: unknown): RestoreResult {
  if (Array.isArray(parsed)) {
    return { items: importSavedItems(parsed), convos: 0 };
  }
  const data = (parsed ?? {}) as Partial<Backup>;

  if (data.tombstones) mergeTombstones(data.tombstones);
  const items = importSavedItems(Array.isArray(data.items) ? data.items : []);

  if (data.convoTombstones) mergeConvoTombstones(data.convoTombstones);
  const convos = mergeInConvos(data.convos);

  return { items, convos };
}

/** 「Imported 3 saved items and 2 conversations」之類的說明文字。 */
export function describeRestore(r: RestoreResult): string {
  const parts: string[] = [];
  if (r.items > 0) parts.push(`${r.items} saved item${r.items === 1 ? "" : "s"}`);
  if (r.convos > 0) parts.push(`${r.convos} conversation${r.convos === 1 ? "" : "s"}`);
  return parts.length > 0
    ? `Imported ${parts.join(" and ")}`
    : "Nothing new to import (already up to date)";
}
