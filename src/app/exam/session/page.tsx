"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  FiClock,
  FiChevronLeft,
  FiChevronRight,
  FiFlag,
  FiPause,
  FiPlay,
  FiGrid,
  FiAlertTriangle,
  FiCoffee,
} from "react-icons/fi";

interface QuestionImage {
  data: string;
  contentType: string;
  location: "question" | "explanation";
}

interface Question {
  _id: string;
  text: string;
  optionA: string;
  optionB: string;
  optionC: string;
  correctAnswer: "A" | "B" | "C";
  topic: string;
  explanation?: string;
  images?: QuestionImage[];
}

interface ExamConfig {
  mode: "full" | "custom";
  topics: string[];
  totalQuestions: number;
  timeLimitMinutes: number;
  canPauseTimer: boolean;
  showCorrectAnswers: boolean;
}

export default function ExamSessionPage() {
  const router = useRouter();
  const [config, setConfig] = useState<ExamConfig | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, "A" | "B" | "C">>({});
  const [flagged, setFlagged] = useState<Set<number>>(new Set());
  const [timeLeft, setTimeLeft] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [showGrid, setShowGrid] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showConfirmSubmit, setShowConfirmSubmit] = useState(false);
  const [startedAt] = useState(new Date());
  const [session, setSession] = useState(1); // For full mock: 1 or 2
  const [onBreak, setOnBreak] = useState(false);
  const [breakTimeLeft, setBreakTimeLeft] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load config and fetch questions
  useEffect(() => {
    const stored = sessionStorage.getItem("exam_config");
    if (!stored) {
      router.push("/exam/setup");
      return;
    }
    const cfg: ExamConfig = JSON.parse(stored);
    setConfig(cfg);

    const sessionTime =
      cfg.mode === "full" ? 135 * 60 : cfg.timeLimitMinutes * 60;
    setTimeLeft(sessionTime);

    // Fetch questions
    let url: string;
    if ((cfg as Record<string, unknown>).mockExamId) {
      url = `/api/questions?mockExamId=${(cfg as Record<string, unknown>).mockExamId}`;
    } else {
      const topicsParam = cfg.topics.join(",");
      const count = cfg.mode === "full" ? 180 : cfg.totalQuestions;
      url = `/api/questions?topics=${encodeURIComponent(topicsParam)}&count=${count}`;
    }

    fetch(url)
      .then((r) => r.json())
      .then((data) => {
        setQuestions(data.questions || []);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, [router]);

  // Timer
  useEffect(() => {
    if (loading || isPaused || onBreak) return;

    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          // Time's up — auto submit
          handleSubmit(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, isPaused, onBreak]);

  // Break timer
  useEffect(() => {
    if (!onBreak) return;

    const interval = setInterval(() => {
      setBreakTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [onBreak]);

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const currentSessionQuestions = useCallback(() => {
    if (!config || config.mode !== "full") return questions;
    const start = (session - 1) * 90;
    const end = Math.min(start + 90, questions.length);
    return questions.slice(start, end);
  }, [config, session, questions]);

  const sessionQs = currentSessionQuestions();
  const currentQ = sessionQs[currentIndex];
  const globalIndex = config?.mode === "full" ? (session - 1) * 90 + currentIndex : currentIndex;

  function selectAnswer(choice: "A" | "B" | "C") {
    setAnswers((prev) => ({ ...prev, [globalIndex]: choice }));
  }

  function toggleFlag() {
    setFlagged((prev) => {
      const next = new Set(prev);
      if (next.has(globalIndex)) next.delete(globalIndex);
      else next.add(globalIndex);
      return next;
    });
  }

  function goNext() {
    if (currentIndex < sessionQs.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  }

  function goPrev() {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  }

  function goToQuestion(i: number) {
    setCurrentIndex(i);
    setShowGrid(false);
  }

  const handleSubmit = useCallback(
    async (autoSubmit = false) => {
      if (!config) return;

      // For full mock session 1 — go to break
      if (config.mode === "full" && session === 1 && !autoSubmit) {
        setOnBreak(true);
        setBreakTimeLeft(30 * 60);
        return;
      }

      const userId = localStorage.getItem("cfa_user_id");
      if (!userId) return;

      // Calculate score
      let correct = 0;
      const topicCorrect: Record<string, number> = {};
      const topicTotal: Record<string, number> = {};

      questions.forEach((q, i) => {
        const topic = q.topic;
        topicTotal[topic] = (topicTotal[topic] || 0) + 1;
        if (answers[i] === q.correctAnswer) {
          correct++;
          topicCorrect[topic] = (topicCorrect[topic] || 0) + 1;
        }
      });

      const topicBreakdown = Object.keys(topicTotal).map((topic) => ({
        topic,
        correct: topicCorrect[topic] || 0,
        total: topicTotal[topic],
        percentage: Math.round(((topicCorrect[topic] || 0) / topicTotal[topic]) * 100),
      }));

      const examData = {
        userId: parseInt(userId, 10),
        config,
        questionIds: questions.map((q) => q._id),
        answers: questions.map((q, i) => ({
          questionId: q._id,
          selected: answers[i] || null,
          correct: q.correctAnswer,
          isCorrect: answers[i] === q.correctAnswer,
        })),
        score: correct,
        totalQuestions: questions.length,
        percentage: Math.round((correct / questions.length) * 100),
        topicBreakdown,
        startedAt: startedAt.toISOString(),
        completedAt: new Date().toISOString(),
        timeSpentSeconds: config.timeLimitMinutes * 60 - timeLeft,
      };

      try {
        const res = await fetch("/api/exam", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(examData),
        });
        const data = await res.json();

        // Store for review page
        sessionStorage.setItem(
          "exam_result",
          JSON.stringify({
            ...examData,
            examId: data.examId,
            questions,
          })
        );

        router.push("/exam/review");
      } catch {
        alert("Failed to save exam. Please try again.");
      }
    },
    [config, session, questions, answers, startedAt, timeLeft, router]
  );

  function endBreak() {
    setOnBreak(false);
    setSession(2);
    setCurrentIndex(0);
    setTimeLeft(135 * 60);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-cfa-navy flex items-center justify-center">
        <div className="text-center text-white">
          <div className="w-12 h-12 border-4 border-cfa-gold border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-lg">Loading your exam...</p>
        </div>
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <FiAlertTriangle className="text-4xl text-amber-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-cfa-navy mb-2">No Questions Available</h2>
          <p className="text-gray-500 mb-6">
            Please seed the database first or upload questions.
          </p>
          <button
            onClick={() => router.push("/exam/setup")}
            className="bg-cfa-navy text-white px-6 py-2 rounded-lg hover:bg-cfa-navy-light"
          >
            Back to Setup
          </button>
        </div>
      </div>
    );
  }

  // Break screen
  if (onBreak) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-cfa-navy to-cfa-navy-light flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl p-8 max-w-md w-full text-center">
          <FiCoffee className="text-5xl text-cfa-gold mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-cfa-navy mb-2">Break Time</h2>
          <p className="text-gray-500 mb-6">
            Session 1 complete! Take a break before Session 2.
          </p>
          <div className="text-4xl font-mono text-cfa-navy mb-6">
            {formatTime(breakTimeLeft)}
          </div>
          <p className="text-sm text-gray-400 mb-6">
            Session 1: {Object.keys(answers).filter((k) => parseInt(k) < 90).length}/90 answered
          </p>
          <button
            onClick={endBreak}
            className="w-full bg-cfa-gold hover:bg-cfa-gold-light text-cfa-navy font-bold py-3 rounded-xl text-lg"
          >
            Start Session 2
          </button>
        </div>
      </div>
    );
  }

  const answeredCount = sessionQs.filter(
    (_, i) => answers[config?.mode === "full" ? (session - 1) * 90 + i : i] !== undefined
  ).length;

  const timerDanger = timeLeft < 300;
  const timerWarning = timeLeft < 600 && !timerDanger;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Top Bar */}
      <header className="bg-cfa-navy text-white shadow-lg sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            {config?.mode === "full" && (
              <span className="bg-white/10 px-3 py-1 rounded-lg text-sm">
                Session {session}/2
              </span>
            )}
            <span className="text-sm text-gray-300">
              Q {currentIndex + 1}/{sessionQs.length}
            </span>
            <span className="text-sm text-gray-400">
              ({answeredCount} answered)
            </span>
          </div>

          <div className="flex items-center gap-3">
            {/* Timer */}
            <div
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-mono text-sm ${
                timerDanger
                  ? "bg-red-500/20 text-red-300"
                  : timerWarning
                  ? "bg-amber-500/20 text-amber-300"
                  : "bg-white/10"
              }`}
            >
              <FiClock />
              {formatTime(timeLeft)}
            </div>

            {config?.canPauseTimer && (
              <button
                onClick={() => setIsPaused(!isPaused)}
                className="p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
                title={isPaused ? "Resume" : "Pause"}
              >
                {isPaused ? <FiPlay /> : <FiPause />}
              </button>
            )}

            <button
              onClick={() => setShowGrid(!showGrid)}
              className="p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
              title="Question Navigator"
            >
              <FiGrid />
            </button>
          </div>
        </div>
      </header>

      {/* Paused overlay */}
      {isPaused && (
        <div className="fixed inset-0 bg-cfa-navy/95 z-40 flex items-center justify-center">
          <div className="text-center text-white">
            <FiPause className="text-5xl text-cfa-gold mx-auto mb-4" />
            <h2 className="text-2xl font-bold mb-2">Exam Paused</h2>
            <p className="text-gray-300 mb-6">Questions are hidden while paused.</p>
            <button
              onClick={() => setIsPaused(false)}
              className="bg-cfa-gold text-cfa-navy font-bold px-8 py-3 rounded-xl text-lg hover:bg-cfa-gold-light"
            >
              Resume Exam
            </button>
          </div>
        </div>
      )}

      {/* Question Grid Sidebar */}
      {showGrid && (
        <div className="fixed inset-0 z-30" onClick={() => setShowGrid(false)}>
          <div
            className="absolute right-0 top-0 h-full w-80 bg-white shadow-2xl p-6 overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-bold text-cfa-navy mb-4">Question Navigator</h3>
            <div className="grid grid-cols-6 gap-2">
              {sessionQs.map((_, i) => {
                const gi =
                  config?.mode === "full" ? (session - 1) * 90 + i : i;
                const answered = answers[gi] !== undefined;
                const isFlagged = flagged.has(gi);
                const isCurrent = i === currentIndex;

                return (
                  <button
                    key={i}
                    onClick={() => goToQuestion(i)}
                    className={`w-10 h-10 rounded-lg text-xs font-medium transition-all relative ${
                      isCurrent
                        ? "bg-cfa-navy text-white ring-2 ring-cfa-gold"
                        : answered
                        ? "bg-cfa-navy/10 text-cfa-navy"
                        : "bg-gray-100 text-gray-400"
                    }`}
                  >
                    {i + 1}
                    {isFlagged && (
                      <div className="absolute -top-1 -right-1 w-3 h-3 bg-amber-500 rounded-full" />
                    )}
                  </button>
                );
              })}
            </div>
            <div className="mt-4 text-xs text-gray-400 space-y-1">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-cfa-navy/10 rounded" /> Answered
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-gray-100 rounded" /> Unanswered
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-gray-100 rounded relative">
                  <div className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-amber-500 rounded-full" />
                </div>{" "}
                Flagged
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Question Content */}
      <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-6">
        {currentQ && (
          <>
            {/* Topic badge */}
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs bg-cfa-navy/5 text-cfa-navy px-3 py-1 rounded-full font-medium">
                {currentQ.topic}
              </span>
              <button
                onClick={toggleFlag}
                className={`flex items-center gap-1 text-sm px-3 py-1 rounded-full transition-colors ${
                  flagged.has(globalIndex)
                    ? "bg-amber-100 text-amber-700"
                    : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                }`}
              >
                <FiFlag />
                {flagged.has(globalIndex) ? "Flagged" : "Flag"}
              </button>
            </div>

            {/* Question text */}
            <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
              <p className="text-gray-800 leading-relaxed whitespace-pre-line">
                {currentQ.text}
              </p>
              {currentQ.images?.filter((img) => img.location === "question").map((img, i) => (
                <img
                  key={i}
                  src={`data:${img.contentType};base64,${img.data}`}
                  alt={`Question image ${i + 1}`}
                  className="mt-4 max-w-full rounded-lg border border-gray-100"
                />
              ))}
            </div>

            {/* Options */}
            <div className="space-y-3 mb-8">
              {(["A", "B", "C"] as const).map((letter) => {
                const optionText =
                  letter === "A"
                    ? currentQ.optionA
                    : letter === "B"
                    ? currentQ.optionB
                    : currentQ.optionC;
                const selected = answers[globalIndex] === letter;

                return (
                  <button
                    key={letter}
                    onClick={() => selectAnswer(letter)}
                    className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                      selected
                        ? "border-cfa-navy bg-cfa-navy/5"
                        : "border-gray-200 bg-white hover:border-gray-300"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                          selected
                            ? "bg-cfa-navy text-white"
                            : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {letter}
                      </span>
                      <span className="text-gray-700 pt-1">{optionText}</span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Navigation */}
            <div className="flex items-center justify-between">
              <button
                onClick={goPrev}
                disabled={currentIndex === 0}
                className="flex items-center gap-1 px-4 py-2 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <FiChevronLeft /> Previous
              </button>

              {currentIndex === sessionQs.length - 1 ? (
                <button
                  onClick={() => setShowConfirmSubmit(true)}
                  className="bg-cfa-gold hover:bg-cfa-gold-light text-cfa-navy font-bold px-6 py-2 rounded-lg transition-colors"
                >
                  {config?.mode === "full" && session === 1
                    ? "End Session 1"
                    : "Submit Exam"}
                </button>
              ) : (
                <button
                  onClick={goNext}
                  className="flex items-center gap-1 px-4 py-2 rounded-lg bg-cfa-navy text-white hover:bg-cfa-navy-light transition-colors"
                >
                  Next <FiChevronRight />
                </button>
              )}
            </div>
          </>
        )}
      </main>

      {/* Confirm Submit Modal */}
      {showConfirmSubmit && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full">
            <h3 className="text-lg font-bold text-cfa-navy mb-2">
              {config?.mode === "full" && session === 1
                ? "End Session 1?"
                : "Submit Exam?"}
            </h3>
            <p className="text-gray-500 text-sm mb-4">
              {answeredCount}/{sessionQs.length} questions answered.
              {answeredCount < sessionQs.length && (
                <span className="text-amber-600">
                  {" "}
                  {sessionQs.length - answeredCount} unanswered.
                </span>
              )}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirmSubmit(false)}
                className="flex-1 border border-gray-300 text-gray-600 py-2.5 rounded-xl hover:bg-gray-50 font-medium"
              >
                Go Back
              </button>
              <button
                onClick={() => {
                  setShowConfirmSubmit(false);
                  handleSubmit();
                }}
                className="flex-1 bg-cfa-gold text-cfa-navy py-2.5 rounded-xl font-bold hover:bg-cfa-gold-light"
              >
                {config?.mode === "full" && session === 1
                  ? "Start Break"
                  : "Submit"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
