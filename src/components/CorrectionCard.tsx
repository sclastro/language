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
    return (
      <div className="correction ok">
        <div className="c-head">✓ 冇問題,寫得好自然!</div>
      </div>
    );
  }

  // 完整正確版本:有 rewrite 而且同原句唔一樣先顯示。
  const showRewrite =
    !!rewrite && rewrite.trim() !== "" && rewrite.trim() !== (original ?? "").trim();

  return (
    <div className="correction">
      <div className="c-head">✎ 糾正</div>
      {corrections.map((c, i) => (
        <div className="c-item" key={i}>
          <div>
            <span className="orig">{c.original}</span>
            <span className="arrow">→</span>
            <span className="fixed">{c.corrected}</span>
            <SpeakerButton text={c.corrected} title="讀出正確版本" />
            <SaveButton text={c.corrected} kind="correction" />
          </div>
          {c.explanation && <div className="explain">{c.explanation}</div>}
        </div>
      ))}

      {showRewrite && (
        <div className="rewrite">
          <div className="rewrite-head">✍️ 完整正確版本</div>
          <div className="rewrite-body">
            <span className="rewrite-text">{rewrite}</span>
            <SpeakerButton text={rewrite!} title="讀出完整正確版本" />
            <SaveButton text={rewrite!} kind="rewrite" />
          </div>
        </div>
      )}
    </div>
  );
}
