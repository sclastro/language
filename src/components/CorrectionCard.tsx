import type { Correction, Polish } from "@/lib/types";
import { fullCorrectedText } from "@/lib/fullRewrite";
import SpeakerButton from "./SpeakerButton";
import SaveButton from "./SaveButton";

/**
 * 「可以更地道」的建議。
 *
 * 與糾正分開顯示(另一種顏色、另一個標題),因為兩者的意義完全不同:
 * 糾正是「你寫錯了」,這裡是「你沒有寫錯,但母語者不會這樣講」。
 * 混在一起的話,每句都像滿是錯誤,既打擊信心,亦分不清哪些非改不可。
 */
function PolishSection({ polish }: { polish: Polish[] }) {
  if (polish.length === 0) return null;
  return (
    <div className="polish">
      <div className="polish-head">💡 More natural</div>
      {polish.map((p, i) => (
        <div className="p-item" key={i}>
          <div>
            <span className="p-orig">{p.original}</span>
            <span className="arrow">→</span>
            <span className="p-better">{p.suggestion}</span>
            <SpeakerButton text={p.suggestion} title="Read the suggestion aloud" />
            <SaveButton
              text={p.suggestion}
              kind="polish"
              original={p.original}
              explanation={p.explanation}
            />
          </div>
          {p.explanation && <div className="explain">{p.explanation}</div>}
        </div>
      ))}
    </div>
  );
}

export default function CorrectionCard({
  corrections,
  polish = [],
  rewrite,
  original,
}: {
  corrections: Correction[];
  polish?: Polish[];
  rewrite?: string;
  original?: string;
}) {
  if (corrections.length === 0) {
    // 寫啱嘅句子同樣值得收藏同聽發音,所以照樣要有 ☆ 同 🔊 —— 之前這裡
    // 得一句「Looks good」,結果自己寫啱嘅句子反而收藏唔到。
    // 句子本身喺上面嘅泡泡已經顯示,冇必要再重複一次,所以只放兩個掣。
    const ok = (rewrite?.trim() || original?.trim()) ?? "";
    // 有地道建議時就不可以講「sounds natural」—— 那正正是它不夠自然的意思。
    const hasPolish = polish.length > 0;
    return (
      <div className={hasPolish ? "correction has-polish" : "correction ok"}>
        <div className="c-head">
          <span>
            {hasPolish
              ? "✓ Grammar looks good"
              : "✓ Looks good — that sounds natural!"}
          </span>
          {ok && (
            <span className="c-head-actions">
              <SpeakerButton text={ok} title="Read your sentence aloud" />
              {/* 有地道建議時就不提供 ☆:收藏自己那句生硬的寫法等於記住它。
                  每條建議本身都有自己的 ☆,要收藏就收藏更好的說法。 */}
              {!hasPolish && <SaveButton text={ok} kind="rewrite" />}
            </span>
          )}
        </div>
        <PolishSection polish={polish} />
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

      <PolishSection polish={polish} />
    </div>
  );
}
