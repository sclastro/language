import type { Correction } from "./types";

/**
 * 取得「完整正確版本」—— 整段訊息改好之後的樣子。
 *
 * ⚠️ 不可以純粹相信模型回的 `rewrite`。訊息長而只有一處錯時,模型有時只回
 * **它改動過的那一句**,於是卡片上寫住「Full corrected version」卻只有一句,
 * 用戶撳 ★ 收藏到的亦只有一句 —— 打了一大段,收藏返一句。
 *
 * 所以這裡加一層保險:`rewrite` 明顯短過原文時,改為用 `corrections` 自行合成 ——
 * 把每處 original → corrected 套用回原訊息。全部片段都對得上才用合成結果,
 * 對不上就寧願用模型那份,不會亂砌。
 */

/** `rewrite` 至少要有原文這個比例的長度,才當它真的重寫了整段。 */
const COMPLETE_RATIO = 0.6;

/** 把每處糾正套用回原訊息;有任何片段對不上就回 null(寧缺勿亂)。 */
export function applyCorrections(
  original: string,
  corrections: Correction[]
): string | null {
  if (!original.trim() || corrections.length === 0) return null;
  let out = original;
  for (const c of corrections) {
    const from = (c.original ?? "").trim();
    const to = (c.corrected ?? "").trim();
    if (!from || !to) return null;
    const at = out.indexOf(from);
    if (at === -1) return null; // 片段搵唔到,唔可以亂猜位置
    out = out.slice(0, at) + to + out.slice(at + from.length);
  }
  return out;
}

export function fullCorrectedText(
  original: string | undefined,
  corrections: Correction[],
  rewrite: string | undefined
): string {
  const orig = (original ?? "").trim();
  const rw = (rewrite ?? "").trim();

  // 冇原文可以比較就只能信模型
  if (!orig) return rw;

  // 長度相若 = 模型真的重寫了整段
  if (rw && rw.length >= orig.length * COMPLETE_RATIO) return rw;

  // 明顯太短(或者根本冇)→ 用糾正自行合成整段
  const synthesised = applyCorrections(orig, corrections);
  return synthesised ?? rw;
}

const norm = (s: string) => s.replace(/\s+/g, " ").trim();

/**
 * 決定卡片上的「Natural version」要顯示甚麼;回空字串即不顯示。
 *
 * 不顯示的情況:
 *  - 模型沒有給(舊訊息、被截斷、或它認為已經夠自然)。
 *  - 沒有糾正亦沒有地道建議:卡片正寫着「sounds natural」,再附一段「更自然版本」自相矛盾。
 *  - 與完整正確版本(或原文)實質相同:重複一次只會佔位置。
 */
export function naturalVersion(
  original: string | undefined,
  corrections: Correction[],
  polishCount: number,
  rewrite: string | undefined,
  natural: string | undefined
): string {
  const nat = (natural ?? "").trim();
  if (!nat) return "";
  if (corrections.length === 0 && polishCount === 0) return "";
  const full = fullCorrectedText(original, corrections, rewrite);
  if (norm(nat) === norm(full) || norm(nat) === norm(original ?? "")) return "";
  return nat;
}
