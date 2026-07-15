import type { Correction } from "@/lib/types";
import SpeakerButton from "./SpeakerButton";

export default function CorrectionCard({
  corrections,
}: {
  corrections: Correction[];
}) {
  if (corrections.length === 0) {
    return (
      <div className="correction ok">
        <div className="c-head">✓ 冇問題,寫得好自然!</div>
      </div>
    );
  }

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
          </div>
          {c.explanation && <div className="explain">{c.explanation}</div>}
        </div>
      ))}
    </div>
  );
}
