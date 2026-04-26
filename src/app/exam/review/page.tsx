"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  FiArrowLeft,
  FiCheckCircle,
  FiXCircle,
  FiAward,
  FiBarChart2,
  FiChevronDown,
  FiChevronUp,
  FiEdit3,
} from "react-icons/fi";

interface ExamResult {
  examId: string;
  config: {
    mode: string;
    showCorrectAnswers: boolean;
  };
  score: number;
  totalQuestions: number;
  percentage: number;
  topicBreakdown: {
    topic: string;
    correct: number;
    total: number;
    percentage: number;
  }[];
  timeSpentSeconds: number;
  questions: {
    _id: string;
    text: string;
    optionA: string;
    optionB: string;
    optionC: string;
    correctAnswer: "A" | "B" | "C";
    topic: string;
    explanation?: string;
    source?: string;
    images?: {
      data: string;
      contentType: string;
      location: "question" | "explanation";
    }[];
  }[];
  answers: {
    questionId: string;
    selected: "A" | "B" | "C" | null;
    correct: "A" | "B" | "C";
    isCorrect: boolean;
  }[];
}

export default function ExamReviewPage() {
  const router = useRouter();
  const [result, setResult] = useState<ExamResult | null>(null);
  const [showQuestions, setShowQuestions] = useState(false);
  const [expandedQ, setExpandedQ] = useState<number | null>(null);
  const [filter, setFilter] = useState<"all" | "correct" | "incorrect" | "unanswered">(
    "all"
  );
  const [overrideMode, setOverrideMode] = useState<string | null>(null);

  async function handleOverrideAnswer(questionId: string, newAnswer: "A" | "B" | "C", index: number) {
    try {
      const res = await fetch("/api/questions/answer", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId, correctAnswer: newAnswer }),
      });
      if (!res.ok) return;

      // Update local state
      setResult((prev) => {
        if (!prev) return prev;
        const updatedQuestions = [...prev.questions];
        updatedQuestions[index] = { ...updatedQuestions[index], correctAnswer: newAnswer };
        const updatedAnswers = [...prev.answers];
        const wasCorrect = updatedAnswers[index].isCorrect;
        const isNowCorrect = updatedAnswers[index].selected === newAnswer;
        updatedAnswers[index] = { ...updatedAnswers[index], correct: newAnswer, isCorrect: isNowCorrect };

        const scoreDelta = (isNowCorrect ? 1 : 0) - (wasCorrect ? 1 : 0);
        const newScore = prev.score + scoreDelta;
        const newPercentage = Math.round((newScore / prev.totalQuestions) * 100);

        // Recalculate topic breakdown
        const topicCorrect: Record<string, number> = {};
        const topicTotal: Record<string, number> = {};
        updatedQuestions.forEach((q, i) => {
          topicTotal[q.topic] = (topicTotal[q.topic] || 0) + 1;
          if (updatedAnswers[i].isCorrect) {
            topicCorrect[q.topic] = (topicCorrect[q.topic] || 0) + 1;
          }
        });
        const topicBreakdown = Object.keys(topicTotal).map((topic) => ({
          topic,
          correct: topicCorrect[topic] || 0,
          total: topicTotal[topic],
          percentage: Math.round(((topicCorrect[topic] || 0) / topicTotal[topic]) * 100),
        }));

        return {
          ...prev,
          questions: updatedQuestions,
          answers: updatedAnswers,
          score: newScore,
          percentage: newPercentage,
          topicBreakdown,
        };
      });
      setOverrideMode(null);
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    const stored = sessionStorage.getItem("exam_result");
    if (!stored) {
      router.push("/exam/setup");
      return;
    }
    setResult(JSON.parse(stored));
  }, [router]);

  if (!result) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-cfa-gold border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const passed = result.percentage >= 70;
  const timeStr = `${Math.floor(result.timeSpentSeconds / 60)}m ${result.timeSpentSeconds % 60}s`;

  const filteredQuestions = result.questions
    .map((q, i) => ({ question: q, answer: result.answers[i], index: i }))
    .filter(({ answer }) => {
      if (filter === "correct") return answer.isCorrect;
      if (filter === "incorrect") return answer.selected && !answer.isCorrect;
      if (filter === "unanswered") return !answer.selected;
      return true;
    });

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-cfa-navy text-white shadow-lg">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center gap-4">
          <button
            onClick={() => router.push("/")}
            className="text-gray-300 hover:text-white transition-colors"
          >
            <FiArrowLeft className="text-xl" />
          </button>
          <div className="flex items-center gap-3">
            <FiBarChart2 className="text-cfa-gold text-xl" />
            <h1 className="text-lg font-semibold">Exam Results</h1>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Score Card */}
        <div
          className={`rounded-2xl p-8 mb-8 text-center ${
            passed
              ? "bg-gradient-to-br from-green-500 to-emerald-600 text-white"
              : "bg-gradient-to-br from-amber-500 to-orange-600 text-white"
          }`}
        >
          <div className="mb-4">
            {passed ? (
              <FiAward className="text-5xl mx-auto mb-2 opacity-90" />
            ) : (
              <FiBarChart2 className="text-5xl mx-auto mb-2 opacity-90" />
            )}
          </div>
          <div className="text-6xl font-bold mb-2">{result.percentage}%</div>
          <div className="text-xl opacity-90 mb-1">
            {result.score}/{result.totalQuestions} correct
          </div>
          <div className="text-sm opacity-75">Time: {timeStr}</div>
          <div className="mt-4 text-lg font-medium">
            {passed
              ? "Great job! You passed! 🎉"
              : "Keep studying — you'll get there! 💪"}
          </div>
        </div>

        {/* Topic Breakdown */}
        <section className="bg-white rounded-xl border border-gray-200 p-6 mb-8">
          <h2 className="text-lg font-bold text-cfa-navy mb-4">Topic Breakdown</h2>
          <div className="space-y-3">
            {result.topicBreakdown
              .sort((a, b) => a.percentage - b.percentage)
              .map((tb) => (
                <div key={tb.topic}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-gray-700 font-medium">{tb.topic}</span>
                    <span className="text-gray-500">
                      {tb.correct}/{tb.total} ({tb.percentage}%)
                    </span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2.5">
                    <div
                      className={`h-2.5 rounded-full transition-all ${
                        tb.percentage >= 70
                          ? "bg-green-500"
                          : tb.percentage >= 50
                          ? "bg-amber-500"
                          : "bg-red-500"
                      }`}
                      style={{ width: `${tb.percentage}%` }}
                    />
                  </div>
                </div>
              ))}
          </div>
        </section>

        {/* Question Review */}
        {result.config.showCorrectAnswers && (
          <section className="mb-8">
            <button
              onClick={() => setShowQuestions(!showQuestions)}
              className="w-full flex items-center justify-between bg-white rounded-xl border border-gray-200 p-4 hover:border-gray-300 transition-colors"
            >
              <span className="font-bold text-cfa-navy">
                Review Questions ({result.totalQuestions})
              </span>
              {showQuestions ? <FiChevronUp /> : <FiChevronDown />}
            </button>

            {showQuestions && (
              <div className="mt-4">
                {/* Filters */}
                <div className="flex gap-2 mb-4 flex-wrap">
                  {(
                    [
                      { key: "all", label: "All" },
                      { key: "correct", label: "Correct" },
                      { key: "incorrect", label: "Incorrect" },
                      { key: "unanswered", label: "Unanswered" },
                    ] as const
                  ).map(({ key, label }) => (
                    <button
                      key={key}
                      onClick={() => setFilter(key)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        filter === key
                          ? "bg-cfa-navy text-white"
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <div className="space-y-3">
                  {filteredQuestions.map(({ question, answer, index }) => (
                    <div
                      key={index}
                      className="bg-white rounded-xl border border-gray-200 overflow-hidden"
                    >
                      <button
                        onClick={() =>
                          setExpandedQ(expandedQ === index ? null : index)
                        }
                        className="w-full p-4 text-left flex items-center gap-3"
                      >
                        {answer.isCorrect ? (
                          <FiCheckCircle className="text-green-500 flex-shrink-0" />
                        ) : (
                          <FiXCircle className="text-red-500 flex-shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <span className="text-sm text-gray-800 line-clamp-1">
                            {index + 1}. {question.text}
                          </span>
                        </div>
                        <span className="text-xs text-gray-400 flex-shrink-0">
                          {question.topic}
                        </span>
                      </button>

                      {expandedQ === index && (
                        <div className="px-4 pb-4 border-t border-gray-100 pt-3">
                          <p className="text-sm text-gray-700 mb-3">
                            {question.text}
                          </p>
                          {question.images?.filter((img) => img.location === "question").map((img, i) => (
                            <img
                              key={`q-img-${i}`}
                              src={`data:${img.contentType};base64,${img.data}`}
                              alt={`Question image ${i + 1}`}
                              className="mb-3 max-w-full rounded-lg border border-gray-100"
                            />
                          ))}
                          {(["A", "B", "C"] as const).map((letter) => {
                            const text =
                              letter === "A"
                                ? question.optionA
                                : letter === "B"
                                ? question.optionB
                                : question.optionC;
                            const isCorrectAnswer =
                              letter === question.correctAnswer;
                            const isSelected = answer.selected === letter;

                            return (
                              <div
                                key={letter}
                                className={`p-2.5 rounded-lg mb-1.5 text-sm flex items-center gap-2 ${
                                  isCorrectAnswer
                                    ? "bg-green-50 border border-green-200"
                                    : isSelected && !isCorrectAnswer
                                    ? "bg-red-50 border border-red-200"
                                    : "bg-gray-50 border border-gray-100"
                                }`}
                              >
                                <span
                                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                                    isCorrectAnswer
                                      ? "bg-green-500 text-white"
                                      : isSelected
                                      ? "bg-red-500 text-white"
                                      : "bg-gray-200 text-gray-500"
                                  }`}
                                >
                                  {letter}
                                </span>
                                <span>{text}</span>
                                {isCorrectAnswer && (
                                  <FiCheckCircle className="text-green-500 ml-auto flex-shrink-0" />
                                )}
                              </div>
                            );
                          })}
                          {(question.explanation || question.source) && (
                            <div className="mt-3 p-3 bg-blue-50 rounded-lg text-sm text-blue-800">
                              {question.explanation && (
                                <>
                                  <strong>Explanation:</strong>{" "}
                                  {question.explanation}
                                </>
                              )}
                              {question.source && (
                                <p className={`text-xs text-blue-500 italic${question.explanation ? " mt-2" : ""}`}>Source: {question.source}</p>
                              )}
                              {question.images?.filter((img) => img.location === "explanation").map((img, i) => (
                                <img
                                  key={`e-img-${i}`}
                                  src={`data:${img.contentType};base64,${img.data}`}
                                  alt={`Explanation image ${i + 1}`}
                                  className="mt-2 max-w-full rounded-lg"
                                />
                              ))}
                            </div>
                          )}

                          {/* Override correct answer */}
                          <div className="mt-3">
                            {overrideMode === question._id ? (
                              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                                <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-2">
                                  Select the correct answer:
                                </p>
                                <div className="flex gap-2">
                                  {(["A", "B", "C"] as const).map((letter) => (
                                    <button
                                      key={letter}
                                      onClick={() => handleOverrideAnswer(question._id, letter, index)}
                                      className={`flex-1 py-2 rounded-lg text-sm font-bold transition-colors ${
                                        letter === question.correctAnswer
                                          ? "bg-emerald-500 text-white"
                                          : "bg-white border border-amber-300 text-amber-700 hover:bg-amber-100"
                                      }`}
                                    >
                                      {letter}
                                      {letter === question.correctAnswer && " (current)"}
                                    </button>
                                  ))}
                                </div>
                                <button
                                  onClick={() => setOverrideMode(null)}
                                  className="mt-2 text-xs text-gray-500 hover:text-gray-700"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setOverrideMode(question._id)}
                                className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-amber-600 transition-colors"
                              >
                                <FiEdit3 /> Override correct answer
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {/* Actions */}
        <div className="flex gap-4 flex-wrap">
          <button
            onClick={() => router.push("/exam/setup")}
            className="flex-1 bg-cfa-gold hover:bg-cfa-gold-light text-cfa-navy font-bold py-3 rounded-xl transition-colors"
          >
            Take Another Exam
          </button>
          <button
            onClick={() => router.push("/history")}
            className="flex-1 border border-gray-300 text-gray-600 font-medium py-3 rounded-xl hover:bg-gray-50 transition-colors"
          >
            View History
          </button>
          <button
            onClick={() => router.push("/")}
            className="flex-1 border border-gray-300 text-gray-600 font-medium py-3 rounded-xl hover:bg-gray-50 transition-colors"
          >
            Home
          </button>
        </div>
      </div>
    </div>
  );
}
