"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import FontSizeButton from "@/components/FontSizeButton";
import NavMenu from "@/components/NavMenu";
import SpeakerButton from "@/components/SpeakerButton";
import SaveButton from "@/components/SaveButton";
import { addSaved, reviewItem, useSaved } from "@/lib/savedStore";
import { addUsage } from "@/lib/usage";
import { SETTINGS_KEY } from "@/lib/models";
import { scorePronunciation, type PronResult } from "@/lib/pron";
import { PHRASE_SETS_KEY, sanitizePhraseSets, type PhraseSet } from "@/lib/phrases";
import {
  attachOptions,
  cardsFromSaved,
  checkCloze,
  mergeDistractorCache,
  pickQuestions,
  QUIZ_MODES,
  type QuizCard,
  type QuizMode,
  type Question,
} from "@/lib/quiz";

/** 干擾項快取:英文句 → 三個錯誤選項。同一句下次出題不再扣 points。 */
const DISTRACTOR_KEY = "english-tutor-quiz-distractors-v1";
const COUNTS = [5, 10, 20];
const ALL = "all";

type Phase = "setup" | "loading" | "question" | "done";
type Result = { q: Question; correct: boolean };

function loadCache(): Record<string, string[]> {
  try {
    const raw = localStorage.getItem(DISTRACTOR_KEY);
    const v = raw ? (JSON.parse(raw) as unknown) : {};
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, string[]>) : {};
  } catch {
    return {};
  }
}

function isImeEnter(e: React.KeyboardEvent) {
  // 中文輸入法選字時的 Enter 不可當成送出
  return e.nativeEvent.isComposing || e.keyCode === 229;
}

/**
 * Quiz:題目取自收藏,或某一批句庫。三種題型(見 lib/quiz.ts)。
 * 答錯的句子在結果頁可以一按排回今日複習(未收藏的則收藏起來)。
 */
export default function QuizPage() {
  const { items: saved } = useSaved();
  const [sets, setSets] = useState<PhraseSet[]>([]);
  const [model, setModel] = useState<string | undefined>(undefined);
  const [source, setSource] = useState<string>(ALL);
  const [mode, setMode] = useState<QuizMode>("mix");
  const [count, setCount] = useState(10);

  const [phase, setPhase] = useState<Phase>("setup");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [idx, setIdx] = useState(0);
  const [results, setResults] = useState<Result[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  // 目前這題的作答狀態
  const [input, setInput] = useState("");
  const [checked, setChecked] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [recallScore, setRecallScore] = useState<PronResult | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(PHRASE_SETS_KEY);
      const list = raw ? sanitizePhraseSets(JSON.parse(raw)) : [];
      setSets(list);
      // 由句庫的「📝 Quiz」掣進來:預先揀好那一批
      const want = new URLSearchParams(window.location.search).get("set");
      if (want && list.some((s) => s.id === want)) setSource(want);
      const s = localStorage.getItem(SETTINGS_KEY);
      if (s) setModel((JSON.parse(s) as { model?: string }).model);
    } catch {
      /* 壞資料就當空 */
    }
  }, []);

  function sourceCards(): QuizCard[] {
    if (source === ALL) return cardsFromSaved(saved);
    const set = sets.find((s) => s.id === source);
    if (!set) return [];
    // 已收藏的句子記下 id,答錯時才可以排回複習
    const savedIdOf = new Map(saved.map((i) => [i.text, i.id]));
    return set.items.flatMap((it) =>
      [{ en: it.en, zh: it.zh, note: it.note }, ...(it.examples ?? [])].map((c) => ({
        ...c,
        savedId: savedIdOf.get(c.en),
      }))
    );
  }

  const available = phase === "setup" ? sourceCards().length : 0;

  function resetAnswer() {
    setInput("");
    setChecked(false);
    setPicked(null);
    setRecallScore(null);
  }

  async function start() {
    setError(null);
    setNote(null);
    const cards = sourceCards();
    let qs = pickQuestions(cards, mode, count);
    if (qs.length === 0) {
      setError(
        mode === "recall"
          ? "No sentences with a Chinese meaning here. Try another source or question type."
          : "Not enough sentences to make questions. Save some first, or pick a phrase set."
      );
      return;
    }
    setPhase("loading");

    // 多項選擇:缺干擾項的句子一次過向模型取,結果存入快取
    let cache = loadCache();
    const need = qs.filter((q) => q.type === "mcq" && !(cache[q.card.en]?.length >= 3));
    if (need.length) {
      try {
        const res = await fetch("/api/quiz", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: need.map((q) => ({ en: q.card.en, zh: q.card.zh })), model }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          distractors?: (string[] | null)[];
          error?: string;
          usage?: { totalTokens?: number };
        };
        if (!res.ok) throw new Error(data.error || `Server responded ${res.status}`);
        if (data.usage?.totalTokens) addUsage({ tokens: data.usage.totalTokens });
        const add: Record<string, string[]> = {};
        need.forEach((q, i) => {
          const d = data.distractors?.[i];
          if (d && d.length >= 3) add[q.card.en] = d;
        });
        cache = mergeDistractorCache(cache, add);
        try {
          localStorage.setItem(DISTRACTOR_KEY, JSON.stringify(cache));
        } catch {
          /* 容量滿就算 */
        }
      } catch (e) {
        setNote(
          `Could not make multiple-choice options (${
            e instanceof Error ? e.message : "error"
          }), so those became other question types.`
        );
      }
    }
    qs = attachOptions(qs, cache);
    if (qs.length === 0) {
      setPhase("setup");
      setError("Could not make any questions. Please try again.");
      return;
    }
    setQuestions(qs);
    setIdx(0);
    setResults([]);
    resetAnswer();
    setPhase("question");
  }

  const q = questions[idx];

  function record(correct: boolean) {
    setResults((r) => [...r, { q, correct }]);
    if (idx + 1 >= questions.length) {
      setPhase("done");
    } else {
      setIdx(idx + 1);
      resetAnswer();
    }
  }

  function checkRecall() {
    if (input.trim()) setRecallScore(scorePronunciation(q.card.en, input));
    setChecked(true);
  }

  function checkClozeAnswer() {
    setChecked(true);
  }

  const missed = results.filter((r) => !r.correct);
  const score = results.filter((r) => r.correct).length;

  function reviewMissed() {
    let rescheduled = 0;
    let added = 0;
    for (const { q } of missed) {
      if (q.card.savedId) {
        reviewItem(q.card.savedId, false);
        rescheduled++;
      } else if (q.card.zh) {
        addSaved(q.card.en, "phrase", { original: q.card.zh, explanation: q.card.note });
        added++;
      }
    }
    const parts = [];
    if (rescheduled) parts.push(`${rescheduled} moved up in your review`);
    if (added) parts.push(`${added} saved for review`);
    setNote(parts.length ? `Done — ${parts.join(", ")}.` : "Nothing to add.");
  }

  const clozeCorrect = q?.cloze ? checkCloze(q.cloze.answer, input) : false;

  return (
    <div className="app">
      <header className="header">
        <h1>📝 Quiz</h1>
        <div className="controls">
          <Link className="ghost-btn" href="/learn">
            📚 Learn
          </Link>
          <FontSizeButton />
          <NavMenu />
        </div>
      </header>

      {(note || error) && (
        <div className={`statusbar ${error ? "error" : ""}`}>
          {error ? `⚠️ ${error}` : `✓ ${note}`}
        </div>
      )}

      <div className="messages review-wrap">
        {phase === "setup" && (
          <div className="review-card quiz-setup">
            <label>
              Questions from
              <select value={source} onChange={(e) => setSource(e.target.value)}>
                <option value={ALL}>All saved sentences</option>
                {sets.map((s) => (
                  <option key={s.id} value={s.id}>
                    📚 {s.title} ({new Date(s.at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })})
                  </option>
                ))}
              </select>
            </label>
            <label>
              Question type
              <select value={mode} onChange={(e) => setMode(e.target.value as QuizMode)}>
                {QUIZ_MODES.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              How many
              <select value={count} onChange={(e) => setCount(Number(e.target.value))}>
                {COUNTS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <div className="quiz-avail">{available} sentences available</div>
            <button className="primary-btn" onClick={start} disabled={available === 0}>
              Start
            </button>
            {available === 0 && (
              <div className="review-hint">
                Save some sentences first, or get a set in <Link href="/learn">📚 Phrase library</Link>.
              </div>
            )}
          </div>
        )}

        {phase === "loading" && <div className="empty">Preparing questions…</div>}

        {phase === "question" && q && (
          <>
            <div className="review-progress">
              Question {idx + 1} of {questions.length} · {score} correct
            </div>
            <div className="review-card">
              {q.type === "recall" && (
                <>
                  <div className="review-prompt-label">Say it in English</div>
                  <div className="review-text">{q.card.zh}</div>
                  {!checked ? (
                    <>
                      <textarea
                        className="quiz-input"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (isImeEnter(e)) return;
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            checkRecall();
                          }
                        }}
                        placeholder="Type it (optional), or just say it out loud"
                        rows={2}
                        lang="en"
                      />
                      <button className="ghost-btn" onClick={checkRecall}>
                        Show the English
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="review-text">
                        {q.card.en}
                        <SpeakerButton text={q.card.en} title="Read aloud" />
                      </div>
                      {recallScore && (
                        <div className="quiz-compare">
                          <div className="review-prompt-label">You typed — {recallScore.score}% match</div>
                          <div>
                            {recallScore.words.map((w, i) => (
                              <span key={i} className={w.ok ? "w-ok" : "w-miss"}>
                                {w.word}{" "}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {q.card.note && <div className="review-answer">💡 {q.card.note}</div>}
                      <div className="review-grade">
                        <button className="grade-btn bad" onClick={() => record(false)}>
                          ✗ Missed
                        </button>
                        <button className="grade-btn good" onClick={() => record(true)}>
                          ✓ Got it
                        </button>
                      </div>
                    </>
                  )}
                </>
              )}

              {q.type === "cloze" && q.cloze && (
                <>
                  <div className="review-prompt-label">Fill in the blank</div>
                  <div className="review-text quiz-cloze">
                    {q.cloze.before}
                    {checked ? (
                      <span className={clozeCorrect ? "quiz-right" : "quiz-wrong"}>{q.cloze.answer}</span>
                    ) : (
                      <span className="quiz-blank">______</span>
                    )}
                    {q.cloze.after}
                    {checked && <SpeakerButton text={q.card.en} title="Read aloud" />}
                  </div>
                  {q.card.zh && <div className="review-hint">{q.card.zh}</div>}
                  {!checked ? (
                    <>
                      <input
                        className="quiz-input"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (isImeEnter(e)) return;
                          if (e.key === "Enter") checkClozeAnswer();
                        }}
                        placeholder="The missing word"
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        lang="en"
                      />
                      <button className="ghost-btn" onClick={checkClozeAnswer}>
                        Check
                      </button>
                    </>
                  ) : (
                    <>
                      <div className={clozeCorrect ? "quiz-verdict good" : "quiz-verdict bad"}>
                        {clozeCorrect ? "✓ Correct" : input.trim() ? `✗ You wrote “${input.trim()}”` : "✗ No answer"}
                      </div>
                      <button className="primary-btn" onClick={() => record(clozeCorrect)}>
                        Next
                      </button>
                    </>
                  )}
                </>
              )}

              {q.type === "mcq" && q.options && (
                <>
                  <div className="review-prompt-label">
                    {q.card.zh ? "Pick the best English for" : "Which one is correct and natural?"}
                  </div>
                  {q.card.zh && <div className="review-text">{q.card.zh}</div>}
                  <div className="quiz-options">
                    {q.options.map((o) => {
                      const isAnswer = o === q.card.en;
                      const cls = !picked
                        ? ""
                        : isAnswer
                          ? " right"
                          : o === picked
                            ? " wrong"
                            : " dim";
                      return (
                        <button
                          key={o}
                          className={`quiz-option${cls}`}
                          onClick={() => !picked && setPicked(o)}
                          disabled={!!picked}
                        >
                          {o}
                        </button>
                      );
                    })}
                  </div>
                  {picked && (
                    <>
                      <div className="review-text">
                        {q.card.en}
                        <SpeakerButton text={q.card.en} title="Read aloud" />
                      </div>
                      {q.card.note && <div className="review-answer">💡 {q.card.note}</div>}
                      <button className="primary-btn" onClick={() => record(picked === q.card.en)}>
                        Next
                      </button>
                    </>
                  )}
                </>
              )}
            </div>
          </>
        )}

        {phase === "done" && (
          <div className="review-card">
            <div className="quiz-score">
              {score} / {results.length}
            </div>
            <div className="review-hint">
              {missed.length === 0 ? "🎉 All correct!" : `${missed.length} to look at again:`}
            </div>
            {missed.length > 0 && (
              <>
                <div className="quiz-missed">
                  {missed.map(({ q }, i) => (
                    <div className="tr-line" key={i}>
                      <span className="tr-text">
                        {q.card.en}
                        {q.card.zh && <span className="quiz-missed-zh">{q.card.zh}</span>}
                      </span>
                      <span className="tr-actions">
                        <SpeakerButton text={q.card.en} title="Read aloud" />
                        {q.card.zh && (
                          <SaveButton text={q.card.en} kind="phrase" original={q.card.zh} explanation={q.card.note} />
                        )}
                      </span>
                    </div>
                  ))}
                </div>
                <button className="ghost-btn" onClick={reviewMissed} title="Saved ones come back sooner; new ones are saved">
                  📅 Review these sooner
                </button>
              </>
            )}
            <div className="review-grade">
              <button className="grade-btn neutral" onClick={start}>
                ↻ Another round
              </button>
              <button
                className="grade-btn neutral"
                onClick={() => {
                  setPhase("setup");
                  setNote(null);
                  setError(null);
                }}
              >
                ⚙ Change settings
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
