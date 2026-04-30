"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  FiPlay,
  FiClock,
  FiCheckSquare,
  FiEye,
  FiPause,
  FiBookOpen,
  FiSettings,
} from "react-icons/fi";
import Header from "@/components/Header";

const TOPICS = [
  "Ethical and Professional Standards",
  "Quantitative Methods",
  "Economics",
  "Financial Statement Analysis",
  "Corporate Issuers",
  "Equity Investments",
  "Fixed Income",
  "Derivatives",
  "Alternative Investments",
  "Portfolio Management",
] as const;

const TOPIC_SHORT: Record<string, string> = {
  "Ethical and Professional Standards": "Ethics",
  "Quantitative Methods": "Quant",
  Economics: "Econ",
  "Financial Statement Analysis": "FSA",
  "Corporate Issuers": "Corp",
  "Equity Investments": "Equity",
  "Fixed Income": "FI",
  Derivatives: "Deriv",
  "Alternative Investments": "Alts",
  "Portfolio Management": "PM",
};

const TIME_PRESETS = [
  { label: "15 min", value: 15 },
  { label: "30 min", value: 30 },
  { label: "60 min", value: 60 },
  { label: "90 min", value: 90 },
  { label: "Real Exam", value: 270 },
];

export default function ExamSetupPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"full" | "custom" | "mock">("custom");
  const [selectedTopics, setSelectedTopics] = useState<string[]>([...TOPICS]);
  const [timeMinutes, setTimeMinutes] = useState(30);
  const [customTimeInput, setCustomTimeInput] = useState("");
  const [questionCount, setQuestionCount] = useState(20);
  const [canPause, setCanPause] = useState(true);
  const [showAnswers, setShowAnswers] = useState(true);
  const [loading, setLoading] = useState(false);
  const [questionCounts, setQuestionCounts] = useState<Record<string, number>>({});
  const [mockExams, setMockExams] = useState<
    { _id: string; name: string; source: string; totalQuestions: number; timeLimitMinutes: number }[]
  >([]);
  const [selectedMockId, setSelectedMockId] = useState<string>("");
  const [progress, setProgress] = useState<{
    answeredCount: number;
    totalQuestions: number;
    completedCycles: number;
  } | null>(null);

  useEffect(() => {
    const userId = localStorage.getItem("cfa_user_id");
    if (!userId) {
      router.push("/login");
      return;
    }
    // Fetch available question counts
    fetch("/api/questions?counts")
      .then((r) => r.json())
      .then((data) => {
        if (data.byTopic) setQuestionCounts(data.byTopic);
      })
      .catch(() => {});
    // Fetch available mock exams
    fetch("/api/mock-exams")
      .then((r) => r.json())
      .then((data) => {
        if (data.mockExams) setMockExams(data.mockExams);
      })
      .catch(() => {});
    // Fetch user progress
    fetch(`/api/user/progress?userId=${userId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.totalQuestions !== undefined) setProgress(data);
      })
      .catch(() => {});
  }, [router]);

  const totalAvailable = useCallback(() => {
    return selectedTopics.reduce((sum, t) => sum + (questionCounts[t] || 0), 0);
  }, [selectedTopics, questionCounts]);

  function toggleTopic(topic: string) {
    setSelectedTopics((prev) =>
      prev.includes(topic) ? prev.filter((t) => t !== topic) : [...prev, topic]
    );
  }

  function selectAllTopics() {
    setSelectedTopics([...TOPICS]);
  }

  function clearTopics() {
    setSelectedTopics([]);
  }

  // Calculate linked question count from time (1.5 min/question)
  function questionsFromTime(minutes: number) {
    return Math.max(1, Math.round(minutes / 1.5));
  }

  function handleTimePreset(minutes: number) {
    setTimeMinutes(minutes);
    setCustomTimeInput("");
    if (mode === "custom") {
      setQuestionCount(questionsFromTime(minutes));
    }
  }

  function handleCustomTime(val: string) {
    setCustomTimeInput(val);
    const mins = parseInt(val, 10);
    if (!isNaN(mins) && mins > 0) {
      setTimeMinutes(mins);
      if (mode === "custom") {
        setQuestionCount(questionsFromTime(mins));
      }
    }
  }

  function handleQuestionCountChange(val: number) {
    setQuestionCount(val);
    setTimeMinutes(Math.round(val * 1.5));
    setCustomTimeInput("");
  }

  async function startExam() {
    if (mode === "custom" && selectedTopics.length === 0) return;
    if (mode === "mock" && !selectedMockId) return;

    setLoading(true);

    const config = mode === "mock"
      ? {
          mode: "mock" as const,
          mockExamId: selectedMockId,
          topics: [...TOPICS],
          totalQuestions: mockExams.find((m) => m._id === selectedMockId)?.totalQuestions || 90,
          timeLimitMinutes: mockExams.find((m) => m._id === selectedMockId)?.timeLimitMinutes || 270,
          canPauseTimer: false,
          showCorrectAnswers: false,
        }
      : {
          mode,
          topics: mode === "full" ? [...TOPICS] : selectedTopics,
          totalQuestions: mode === "full" ? 180 : questionCount,
          timeLimitMinutes: mode === "full" ? 270 : timeMinutes,
          canPauseTimer: mode === "full" ? false : canPause,
          showCorrectAnswers: mode === "full" ? false : showAnswers,
        };

    // Clear any previously saved exam state so the new config takes effect
    localStorage.removeItem("cfa_exam_state");
    // Store config and navigate
    sessionStorage.setItem("exam_config", JSON.stringify(config));
    router.push("/exam/session");
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header title="Exam Setup" icon={FiSettings} />

      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Mode Selection */}
        <section className="mb-8">
          <h2 className="text-lg font-bold text-cfa-navy mb-4">Exam Mode</h2>
          <div className="grid sm:grid-cols-3 gap-4">
            <button
              onClick={() => setMode("full")}
              className={`p-5 rounded-xl border-2 text-left transition-all ${
                mode === "full"
                  ? "border-cfa-gold bg-cfa-gold/5 shadow-md"
                  : "border-gray-200 bg-white hover:border-gray-300"
              }`}
            >
              <div className="flex items-center gap-3 mb-2">
                <FiBookOpen
                  className={`text-xl ${mode === "full" ? "text-cfa-gold" : "text-gray-400"}`}
                />
                <span className="font-semibold text-cfa-navy">Full Mock Exam</span>
              </div>
              <p className="text-sm text-gray-500">
                180 questions · 2 sessions · 135 min each · 30 min break
              </p>
            </button>
            <button
              onClick={() => setMode("mock")}
              className={`p-5 rounded-xl border-2 text-left transition-all ${
                mode === "mock"
                  ? "border-cfa-gold bg-cfa-gold/5 shadow-md"
                  : "border-gray-200 bg-white hover:border-gray-300"
              }`}
            >
              <div className="flex items-center gap-3 mb-2">
                <FiBookOpen
                  className={`text-xl ${mode === "mock" ? "text-cfa-gold" : "text-gray-400"}`}
                />
                <span className="font-semibold text-cfa-navy">Named Mock Exam</span>
              </div>
              <p className="text-sm text-gray-500">
                Take a specific Schweser/Kaplan mock exam
              </p>
            </button>
            <button
              onClick={() => setMode("custom")}
              className={`p-5 rounded-xl border-2 text-left transition-all ${
                mode === "custom"
                  ? "border-cfa-gold bg-cfa-gold/5 shadow-md"
                  : "border-gray-200 bg-white hover:border-gray-300"
              }`}
            >
              <div className="flex items-center gap-3 mb-2">
                <FiSettings
                  className={`text-xl ${mode === "custom" ? "text-cfa-gold" : "text-gray-400"}`}
                />
                <span className="font-semibold text-cfa-navy">Custom Exam</span>
              </div>
              <p className="text-sm text-gray-500">
                Choose topics, set your own time and question count
              </p>
            </button>
          </div>
        </section>

        {mode === "mock" ? (
          /* Mock Exam Selection */
          <section className="bg-white rounded-xl border border-gray-200 p-6 mb-8">
            <h3 className="font-semibold text-cfa-navy mb-4">Select Mock Exam</h3>
            {mockExams.length === 0 ? (
              <p className="text-sm text-gray-500">
                No mock exams available. Upload mock exam PDFs first.
              </p>
            ) : (
              <div className="space-y-3">
                {mockExams.map((mock) => (
                  <button
                    key={mock._id}
                    onClick={() => setSelectedMockId(mock._id)}
                    className={`w-full p-4 rounded-lg border-2 text-left transition-all ${
                      selectedMockId === mock._id
                        ? "border-cfa-gold bg-cfa-gold/5"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-cfa-navy">{mock.name}</p>
                        <p className="text-xs text-gray-500">{mock.source}</p>
                      </div>
                      <div className="text-right text-sm text-gray-500">
                        <p>{mock.totalQuestions} questions</p>
                        <p>{mock.timeLimitMinutes} min</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
            {selectedMockId && (
              <div className="mt-4 p-3 bg-amber-50 text-amber-800 text-sm rounded-lg">
                Timer cannot be paused. Correct answers shown only after completing the exam.
              </div>
            )}
          </section>
        ) : mode === "full" ? (
          /* Full Mock Info */
          <section className="bg-white rounded-xl border border-gray-200 p-6 mb-8">
            <h3 className="font-semibold text-cfa-navy mb-4">Full Mock Exam Details</h3>
            <div className="grid sm:grid-cols-2 gap-4 text-sm">
              <div className="flex items-center gap-2 text-gray-600">
                <FiCheckSquare className="text-cfa-gold" /> 180 multiple-choice questions (A/B/C)
              </div>
              <div className="flex items-center gap-2 text-gray-600">
                <FiClock className="text-cfa-gold" /> Session 1: 90 questions, 135 minutes
              </div>
              <div className="flex items-center gap-2 text-gray-600">
                <FiClock className="text-cfa-gold" /> Session 2: 90 questions, 135 minutes
              </div>
              <div className="flex items-center gap-2 text-gray-600">
                <FiPause className="text-cfa-gold" /> 30-minute optional break between sessions
              </div>
            </div>
            <div className="mt-4 p-3 bg-amber-50 text-amber-800 text-sm rounded-lg">
              All 10 topics will be tested with proportional weighting. Timer cannot be paused.
              Correct answers shown only after completing the full exam.
            </div>
          </section>
        ) : (
          <>
            {/* Topic Selection */}
            <section className="mb-8">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-cfa-navy">Topics</h2>
                <div className="flex gap-2 text-sm">
                  <button onClick={selectAllTopics} className="text-cfa-navy hover:underline">
                    Select All
                  </button>
                  <span className="text-gray-300">|</span>
                  <button onClick={clearTopics} className="text-gray-500 hover:underline">
                    Clear
                  </button>
                </div>
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                {TOPICS.map((topic) => {
                  const selected = selectedTopics.includes(topic);
                  const count = questionCounts[topic] || 0;
                  return (
                    <button
                      key={topic}
                      onClick={() => toggleTopic(topic)}
                      className={`p-3 rounded-lg border text-left text-sm transition-all flex items-center justify-between ${
                        selected
                          ? "border-cfa-navy bg-cfa-navy/5 text-cfa-navy font-medium"
                          : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className={`w-4 h-4 rounded border flex items-center justify-center ${
                            selected
                              ? "bg-cfa-navy border-cfa-navy"
                              : "border-gray-300"
                          }`}
                        >
                          {selected && (
                            <svg
                              className="w-3 h-3 text-white"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={3}
                                d="M5 13l4 4L19 7"
                              />
                            </svg>
                          )}
                        </div>
                        <span>{TOPIC_SHORT[topic]}</span>
                      </div>
                      <span className="text-xs text-gray-400">{count} Qs</span>
                    </button>
                  );
                })}
              </div>
              {selectedTopics.length === 0 && (
                <p className="text-sm text-red-500 mt-2">Select at least one topic</p>
              )}
              <p className="text-xs text-gray-400 mt-2">
                {totalAvailable()} questions available from selected topics
              </p>
            </section>

            {/* Time & Question Count */}
            <section className="mb-8">
              <h2 className="text-lg font-bold text-cfa-navy mb-4">Time & Questions</h2>
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                {/* Time presets */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <FiClock className="inline mr-1" /> Time Limit
                  </label>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {TIME_PRESETS.map((preset) => (
                      <button
                        key={preset.value}
                        onClick={() => handleTimePreset(preset.value)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                          timeMinutes === preset.value && !customTimeInput
                            ? "bg-cfa-navy text-white"
                            : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                    <input
                      type="number"
                      placeholder="Custom min"
                      value={customTimeInput}
                      onChange={(e) => handleCustomTime(e.target.value)}
                      className="w-28 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-cfa-gold focus:border-cfa-gold outline-none"
                      min="1"
                      max="600"
                    />
                  </div>
                  <p className="text-xs text-gray-400">
                    Current: {timeMinutes} minutes ({Math.floor(timeMinutes / 60)}h{" "}
                    {timeMinutes % 60}m)
                  </p>
                </div>

                {/* Question count slider */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Questions: {questionCount}
                  </label>
                  <input
                    type="range"
                    min="5"
                    max="180"
                    step="5"
                    value={questionCount}
                    onChange={(e) => handleQuestionCountChange(parseInt(e.target.value, 10))}
                    className="w-full accent-cfa-navy"
                  />
                  <div className="flex justify-between text-xs text-gray-400 mt-1">
                    <span>5</span>
                    <span>90</span>
                    <span>180</span>
                  </div>
                </div>

                <div className="p-3 bg-blue-50 text-blue-800 text-xs rounded-lg">
                  ~{(timeMinutes / questionCount).toFixed(1)} minutes per question (CFA
                  standard: 1.5 min/question)
                </div>
              </div>
            </section>

            {/* Options */}
            <section className="mb-8">
              <h2 className="text-lg font-bold text-cfa-navy mb-4">Options</h2>
              <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
                <label className="flex items-center justify-between cursor-pointer">
                  <div className="flex items-center gap-3">
                    <FiPause className="text-gray-400" />
                    <div>
                      <p className="text-sm font-medium text-gray-700">Pause Timer</p>
                      <p className="text-xs text-gray-400">Allow pausing the countdown</p>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={canPause}
                    onChange={(e) => setCanPause(e.target.checked)}
                    className="w-5 h-5 accent-cfa-navy rounded"
                  />
                </label>
                <div className="border-t border-gray-100" />
                <label className="flex items-center justify-between cursor-pointer">
                  <div className="flex items-center gap-3">
                    <FiEye className="text-gray-400" />
                    <div>
                      <p className="text-sm font-medium text-gray-700">
                        Show Correct Answers
                      </p>
                      <p className="text-xs text-gray-400">
                        Reveal answers & explanations during the exam
                      </p>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={showAnswers}
                    onChange={(e) => setShowAnswers(e.target.checked)}
                    className="w-5 h-5 accent-cfa-navy rounded"
                  />
                </label>
              </div>
            </section>
          </>
        )}

        {/* Start Button */}
        {/* Progress Tracker */}
        {progress && progress.totalQuestions > 0 && (
          <section className="bg-white rounded-xl border border-gray-200 p-6 mb-8">
            <h3 className="font-semibold text-cfa-navy mb-3">Your Progress</h3>
            <div className="flex items-center justify-between text-sm text-gray-600 mb-2">
              <span>
                {progress.answeredCount}/{progress.totalQuestions} questions practiced
              </span>
              {progress.completedCycles > 0 && (
                <span className="bg-cfa-gold/10 text-cfa-navy px-2 py-0.5 rounded-full text-xs font-medium">
                  Round {progress.completedCycles + 1}
                </span>
              )}
            </div>
            <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-cfa-gold rounded-full transition-all"
                style={{
                  width: `${Math.round((progress.answeredCount / progress.totalQuestions) * 100)}%`,
                }}
              />
            </div>
            <p className="text-xs text-gray-400 mt-1">
              {Math.round((progress.answeredCount / progress.totalQuestions) * 100)}% complete
              {progress.completedCycles > 0 &&
                ` · ${progress.completedCycles} full ${progress.completedCycles === 1 ? "cycle" : "cycles"} completed`}
            </p>
          </section>
        )}

        {/* Start Button */}
        <div className="sticky bottom-0 bg-gray-50 py-4 border-t border-gray-200">
          <button
            onClick={startExam}
            disabled={loading || (mode === "custom" && selectedTopics.length === 0) || (mode === "mock" && !selectedMockId)}
            className="w-full bg-cfa-gold hover:bg-cfa-gold-light text-cfa-navy font-bold py-4 rounded-xl text-lg transition-all hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <FiPlay />
            {loading
              ? "Loading Questions..."
              : mode === "full"
              ? "Start Full Mock Exam (180 Questions)"
              : mode === "mock"
              ? `Start Mock Exam${selectedMockId ? ` (${mockExams.find((m) => m._id === selectedMockId)?.totalQuestions || ""} Questions)` : ""}`
              : `Start Exam (${questionCount} Questions)`}
          </button>
        </div>
      </div>
    </div>
  );
}
