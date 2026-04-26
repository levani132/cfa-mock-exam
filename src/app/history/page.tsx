"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { FiArrowLeft, FiClock, FiCalendar, FiTrendingUp } from "react-icons/fi";

interface ExamSummary {
  _id: string;
  config: {
    mode: string;
    topics: string[];
    totalQuestions: number;
  };
  score: number;
  totalQuestions: number;
  percentage: number;
  startedAt: string;
  completedAt: string;
  timeSpentSeconds: number;
  topicBreakdown: {
    topic: string;
    correct: number;
    total: number;
    percentage: number;
  }[];
}

export default function HistoryPage() {
  const router = useRouter();
  const [exams, setExams] = useState<ExamSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const userId = localStorage.getItem("cfa_user_id");
    if (!userId) {
      router.push("/login");
      return;
    }

    fetch(`/api/exam?userId=${userId}`)
      .then((r) => r.json())
      .then((data) => {
        setExams(data.exams || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [router]);

  const avgScore =
    exams.length > 0
      ? Math.round(exams.reduce((sum, e) => sum + e.percentage, 0) / exams.length)
      : 0;

  const bestScore = exams.length > 0 ? Math.max(...exams.map((e) => e.percentage)) : 0;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-cfa-navy text-white shadow-lg">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center gap-4">
          <button
            onClick={() => router.push("/")}
            className="text-gray-300 hover:text-white transition-colors"
          >
            <FiArrowLeft className="text-xl" />
          </button>
          <div className="flex items-center gap-3">
            <FiTrendingUp className="text-cfa-gold text-xl" />
            <h1 className="text-lg font-semibold">Exam History</h1>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-8">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-10 h-10 border-4 border-cfa-gold border-t-transparent rounded-full animate-spin" />
          </div>
        ) : exams.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-gray-500 text-lg mb-4">No exams taken yet</p>
            <button
              onClick={() => router.push("/exam/setup")}
              className="bg-cfa-gold hover:bg-cfa-gold-light text-cfa-navy font-bold px-6 py-3 rounded-xl"
            >
              Take Your First Exam
            </button>
          </div>
        ) : (
          <>
            {/* Stats */}
            <div className="grid sm:grid-cols-3 gap-4 mb-8">
              <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
                <p className="text-3xl font-bold text-cfa-navy">{exams.length}</p>
                <p className="text-sm text-gray-500">Exams Taken</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
                <p className="text-3xl font-bold text-cfa-navy">{avgScore}%</p>
                <p className="text-sm text-gray-500">Average Score</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
                <p className="text-3xl font-bold text-cfa-gold">{bestScore}%</p>
                <p className="text-sm text-gray-500">Best Score</p>
              </div>
            </div>

            {/* Exam List */}
            <div className="space-y-3">
              {exams.map((exam) => {
                const date = new Date(exam.completedAt);
                const timeStr = `${Math.floor(exam.timeSpentSeconds / 60)}m`;
                const passed = exam.percentage >= 70;

                return (
                  <div
                    key={exam._id}
                    onClick={() => router.push(`/exam/review?examId=${exam._id}`)}
                    className="bg-white rounded-xl border border-gray-200 p-5 hover:border-gray-300 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <span
                          className={`text-2xl font-bold ${
                            passed ? "text-green-600" : "text-amber-600"
                          }`}
                        >
                          {exam.percentage}%
                        </span>
                        <div>
                          <span className="text-sm font-medium text-gray-800">
                            {exam.config.mode === "full"
                              ? "Full Mock"
                              : exam.config.mode === "mock"
                                ? "Named Mock"
                                : "Custom"} —{" "}
                            {exam.score}/{exam.totalQuestions}
                          </span>
                          <div className="flex items-center gap-3 text-xs text-gray-400 mt-0.5">
                            <span className="flex items-center gap-1">
                              <FiCalendar />
                              {date.toLocaleDateString()}
                            </span>
                            <span className="flex items-center gap-1">
                              <FiClock />
                              {timeStr}
                            </span>
                          </div>
                        </div>
                      </div>
                      <span
                        className={`text-xs px-2 py-1 rounded-full font-medium ${
                          passed
                            ? "bg-green-50 text-green-600"
                            : "bg-amber-50 text-amber-600"
                        }`}
                      >
                        {passed ? "PASS" : "REVIEW"}
                      </span>
                    </div>

                    {/* Mini topic bars */}
                    {exam.topicBreakdown && (
                      <div className="flex gap-1 flex-wrap">
                        {exam.topicBreakdown.map((tb) => (
                          <div
                            key={tb.topic}
                            className="flex items-center gap-1 text-xs text-gray-400"
                            title={`${tb.topic}: ${tb.percentage}%`}
                          >
                            <div className="w-12 bg-gray-100 rounded-full h-1.5">
                              <div
                                className={`h-1.5 rounded-full ${
                                  tb.percentage >= 70
                                    ? "bg-green-400"
                                    : tb.percentage >= 50
                                    ? "bg-amber-400"
                                    : "bg-red-400"
                                }`}
                                style={{ width: `${tb.percentage}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
