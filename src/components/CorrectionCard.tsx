import type { Correction } from "@/lib/types";
import { fullCorrectedText } from "@/lib/fullRewrite";
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

  // 完整正確版本。模型有時只回它改動過的那一句,所以要經 fullCorrectedText
  // 補回整段(見 lib/fullRewrite.ts),否則卡片同 ★ 收藏到的都只有一句。
  const full = fullCorrectedText(original, corrections, rewrite);
  const showRewrite = full !== "" && full !== (original ?? "").trim();

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
            <span className="rewrite-text">{full}</span>
            <SpeakerButton text={full} title="Read the full version aloud" />
            <SaveButton text={full} kind="rewrite" original={original} />
          </div>
        </div>
      )}
    </div>
  );
}
