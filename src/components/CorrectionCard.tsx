import type { Correction } from "@/lib/types";
import SpeakerButton from "./SpeakerButton";
import SaveButton from "./SaveButton";

export default function CorrectionCard({
  corrections,
  rewrite,
  original,
}: {
  corrections: Correction[];
  rewrite?: string;
  original?: string;
}) {
  if (corrections.length === 0) {
    // 寫啱嘅句子同樣值得收藏同聽發音,所以照樣要有 ☆ 同 🔊 —— 之前這裡
    // 得一句「Looks good」,結果自己寫啱嘅句子反而收藏唔到。
    // 句子本身喺上面嘅泡泡已經顯示,冇必要再重複一次,所以只放兩個掣。
    const ok = (rewrite?.trim() || original?.trim()) ?? "";
    return (
      <div className="correction ok">
        <div className="c-head">
          <span>✓ Looks good — that sounds natural!</span>
          {ok && (
            <span className="c-head-actions">
              <SpeakerButton text={ok} title="Read your sentence aloud" />
              <SaveButton text={ok} kind="rewrite" />
            </span>
          )}
        </div>
      </div>
    );
  }

  // 完整正確版本:有 rewrite 且與原句不同時才顯示。
  const showRewrite =
    !!rewrite && rewrite.trim() !== "" && rewrite.trim() !== (original ?? "").trim();

  return (
    <div className="correction">
      <div className="c-head">✎ Corrections</div>
      {corrections.map((c, i) => (
        <div className="c-item" key={i}>
          <div>
            <span className="orig">{c.original}</span>
            <span className="arrow">→</span>
            <span className="fixed">{c.corrected}</span>
            <SpeakerButton text={c.corrected} title="Read the correction aloud" />
            <SaveButton
              text={c.corrected}
              kind="correction"
              original={c.original}
              explanation={c.explanation}
            />
          </div>
          {c.explanation && <div className="explain">{c.explanation}</div>}
        </div>
      ))}

      {showRewrite && (
        <div className="rewrite">
          <div className="rewrite-head">✍️ Full corrected version</div>
          <div className="rewrite-body">
            <span className="rewrite-text">{rewrite}</span>
            <SpeakerButton text={rewrite!} title="Read the full version aloud" />
            <SaveButton text={rewrite!} kind="rewrite" original={original} />
          </div>
        </div>
      )}
    </div>
  );
}
