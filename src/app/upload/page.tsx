"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  FiArrowLeft,
  FiUpload,
  FiFile,
  FiCheck,
  FiTrash2,
  FiSave,
  FiLock,
  FiAlertTriangle,
  FiAlertCircle,
  FiX,
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
];

interface ParsedQuestion {
  text: string;
  optionA: string;
  optionB: string;
  optionC: string;
  correctAnswer: "A" | "B" | "C" | null;
  topic: string;
  explanation?: string;
  warnings?: string[];
}

export default function UploadPage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const answersFileRef = useRef<HTMLInputElement>(null);
  const [password, setPassword] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [tab, setTab] = useState<"qbank" | "mock">("qbank");
  const [file, setFile] = useState<File | null>(null);
  const [answersFile, setAnswersFile] = useState<File | null>(null);
  const [uploadMode, setUploadMode] = useState<"combined" | "separate">("combined");
  const [topicOverride, setTopicOverride] = useState("");
  const [source, setSource] = useState("");
  // Mock-exam-only fields. Saved questions also feed the qbank automatically;
  // this just creates an additional MockExam doc grouping them.
  const [mockName, setMockName] = useState("");
  const [mockTimeLimit, setMockTimeLimit] = useState(270);
  const [savedMock, setSavedMock] = useState<{ name: string; total: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [parsedQuestions, setParsedQuestions] = useState<ParsedQuestion[]>([]);
  const [saving, setSaving] = useState(false);
  const [savedCount, setSavedCount] = useState(0);
  const [savedDuplicates, setSavedDuplicates] = useState(0);
  const [error, setError] = useState("");
  const [parseStats, setParseStats] = useState<{
    totalParsed: number;
    validCount: number;
    duplicateCount: number;
    duplicateIndices: number[];
    warnings: string[];
  } | null>(null);
  const [showWarnings, setShowWarnings] = useState(false);
  const [filterMode, setFilterMode] = useState<"all" | "warnings" | "valid">("all");

  function handleAuth(e: React.FormEvent) {
    e.preventDefault();
    if (password) {
      setAuthenticated(true);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const dropped = e.dataTransfer.files[0];
    if (dropped && dropped.type === "application/pdf") {
      setFile(dropped);
    }
  }

  async function handleUpload() {
    if (!file && !answersFile) return;
    setLoading(true);
    setError("");
    setParseStats(null);

    const formData = new FormData();
    if (uploadMode === "combined") {
      if (file) formData.append("pdf", file);
      formData.append("isAnswerFile", "true");
    } else {
      if (file) formData.append("pdf", file);
      if (answersFile) formData.append("answersPdf", answersFile);
    }
    if (topicOverride) formData.append("topic", topicOverride);
    if (source) formData.append("source", source);

    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        headers: { "x-admin-password": password },
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Upload failed");
        setLoading(false);
        return;
      }

      const data = await res.json();
      setParsedQuestions(data.questions || []);
      setParseStats({
        totalParsed: data.totalParsed || 0,
        validCount: data.validCount || 0,
        duplicateCount: data.duplicateCount || 0,
        duplicateIndices: data.duplicateIndices || [],
        warnings: data.warnings || [],
      });
    } catch {
      setError("Upload failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function saveQuestions() {
    // Filter out questions with missing answers
    const validQuestions = parsedQuestions.filter(
      (q) => q.correctAnswer && ["A", "B", "C"].includes(q.correctAnswer)
    );

    if (validQuestions.length === 0) {
      setError("No valid questions to save (all are missing correct answers)");
      return;
    }

    if (tab === "mock" && !mockName.trim()) {
      setError("Mock exam name is required");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const res = await fetch("/api/upload", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-admin-password": password,
        },
        body: JSON.stringify({
          questions: validQuestions,
          source: source || file?.name || "PDF Upload",
          mockExam:
            tab === "mock"
              ? {
                  name: mockName.trim(),
                  source: source || mockName.trim(),
                  timeLimitMinutes: mockTimeLimit,
                }
              : undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Save failed");
        setSaving(false);
        return;
      }

      const data = await res.json();
      setSavedCount(data.inserted);
      setSavedDuplicates(data.duplicates || 0);
      if (data.mockExam) {
        setSavedMock({ name: data.mockExam.name, total: data.mockExam.totalQuestions });
      }
      setParsedQuestions([]);
      setParseStats(null);
    } catch {
      setError("Save failed. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  function updateQuestion(index: number, field: keyof ParsedQuestion, value: string) {
    setParsedQuestions((prev) =>
      prev.map((q, i) => (i === index ? { ...q, [field]: value } : q))
    );
  }

  function removeQuestion(index: number) {
    setParsedQuestions((prev) => prev.filter((_, i) => i !== index));
  }

  function resetUpload() {
    setFile(null);
    setAnswersFile(null);
    setParsedQuestions([]);
    setParseStats(null);
    setSavedCount(0);
    setSavedDuplicates(0);
    setSavedMock(null);
    setError("");
  }

  const filteredQuestions = parsedQuestions.filter((q) => {
    if (filterMode === "warnings") return q.warnings && q.warnings.length > 0;
    if (filterMode === "valid") return !q.warnings || q.warnings.length === 0;
    return true;
  });

  const warningCount = parsedQuestions.filter(
    (q) => q.warnings && q.warnings.length > 0
  ).length;
  const validCount = parsedQuestions.filter(
    (q) => !q.warnings || q.warnings.length === 0
  ).length;

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-cfa-navy to-cfa-navy-light flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <button
            onClick={() => router.back()}
            className="text-gray-300 hover:text-white flex items-center gap-2 mb-8 text-sm"
          >
            <FiArrowLeft /> Back to Home
          </button>
          <div className="bg-white rounded-2xl p-8">
            <div className="text-center mb-6">
              <FiLock className="text-3xl text-cfa-navy mx-auto mb-3" />
              <h1 className="text-xl font-bold text-cfa-navy">Admin Access</h1>
              <p className="text-sm text-gray-500 mt-1">
                Enter the admin password to upload questions
              </p>
            </div>
            <form onSubmit={handleAuth}>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Admin password"
                className="w-full px-4 py-3 border border-gray-300 rounded-xl mb-4 focus:ring-2 focus:ring-cfa-gold focus:border-cfa-gold outline-none"
                autoFocus
              />
              <button
                type="submit"
                className="w-full bg-cfa-navy text-white font-semibold py-3 rounded-xl hover:bg-cfa-navy-light"
              >
                Access Upload
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header title="Upload Questions" icon={FiUpload} />

      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Tab selector */}
        <div className="flex gap-2 mb-6 border-b border-gray-200">
          <button
            onClick={() => {
              setTab("qbank");
              resetUpload();
            }}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === "qbank"
                ? "border-cfa-gold text-cfa-navy"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            Question Bank
          </button>
          <button
            onClick={() => {
              setTab("mock");
              setUploadMode("separate");
              resetUpload();
            }}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === "mock"
                ? "border-cfa-gold text-cfa-navy"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            Mock Exam
          </button>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 text-red-600 rounded-xl text-sm flex items-center gap-2">
            <FiAlertCircle className="shrink-0" />
            <span>{error}</span>
            <button onClick={() => setError("")} className="ml-auto"><FiX /></button>
          </div>
        )}

        {savedCount > 0 && (
          <div className="mb-6 p-4 bg-green-50 text-green-700 rounded-xl text-sm flex items-center gap-2">
            <FiCheck />
            Saved {savedCount} new questions to the database!
            {savedDuplicates > 0 && ` (${savedDuplicates} duplicates skipped)`}
          </div>
        )}

        {savedMock && (
          <div className="mb-6 p-4 bg-emerald-50 text-emerald-700 rounded-xl text-sm flex items-center gap-2">
            <FiCheck />
            Mock exam <span className="font-semibold">{savedMock.name}</span> created
            with {savedMock.total} questions. It&apos;s now available on the exam setup page.
          </div>
        )}

        {/* Upload Section */}
        <section className="bg-white rounded-xl border border-gray-200 p-6 mb-8">
          <h2 className="font-bold text-cfa-navy mb-4">
            {tab === "mock" ? "Upload Mock Exam PDF" : "Upload PDF"}
          </h2>

          {tab === "mock" && (
            <div className="mb-4 p-3 bg-blue-50 text-blue-800 text-xs rounded-lg leading-relaxed">
              Questions are saved to the bank automatically. Re-uploading another file
              with the same mock name will append its questions to the existing mock —
              useful for multi-session exams (upload Session 1, then Session 2 with the
              same name).
            </div>
          )}

          {tab === "mock" && (
            <div className="grid sm:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Mock Exam Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={mockName}
                  onChange={(e) => setMockName(e.target.value)}
                  placeholder="e.g., AnalystPrep Mock Exam 2024 #3"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Time Limit (minutes)
                </label>
                <input
                  type="number"
                  value={mockTimeLimit}
                  onChange={(e) => setMockTimeLimit(parseInt(e.target.value, 10) || 0)}
                  min={1}
                  max={600}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
            </div>
          )}

          {/* Upload mode toggle */}
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => { setUploadMode("combined"); setAnswersFile(null); }}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                uploadMode === "combined"
                  ? "bg-cfa-navy text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              Q&A in same file
            </button>
            <button
              onClick={() => setUploadMode("separate")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                uploadMode === "separate"
                  ? "bg-cfa-navy text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              Separate Q + A files
            </button>
          </div>

          {/* Drop zone - questions file */}
          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => fileRef.current?.click()}
            className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center cursor-pointer hover:border-cfa-gold/50 transition-colors mb-3"
          >
            <input
              ref={fileRef}
              type="file"
              accept=".pdf"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
            {file ? (
              <div className="flex items-center justify-center gap-2 text-cfa-navy">
                <FiFile className="text-xl" />
                <span className="font-medium">{file.name}</span>
                <span className="text-sm text-gray-400">
                  ({(file.size / 1024).toFixed(1)} KB)
                </span>
              </div>
            ) : (
              <>
                <FiUpload className="text-2xl text-gray-400 mx-auto mb-1" />
                <p className="text-gray-500 text-sm">
                  {uploadMode === "combined"
                    ? "Drop PDF with questions & answers"
                    : "Drop the Questions PDF here"}
                </p>
              </>
            )}
          </div>

          {/* Answers file drop zone (separate mode only) */}
          {uploadMode === "separate" && (
            <div
              onClick={() => answersFileRef.current?.click()}
              className="border-2 border-dashed border-blue-200 rounded-xl p-6 text-center cursor-pointer hover:border-blue-400/50 transition-colors mb-3"
            >
              <input
                ref={answersFileRef}
                type="file"
                accept=".pdf"
                className="hidden"
                onChange={(e) => setAnswersFile(e.target.files?.[0] || null)}
              />
              {answersFile ? (
                <div className="flex items-center justify-center gap-2 text-blue-700">
                  <FiFile className="text-xl" />
                  <span className="font-medium">{answersFile.name}</span>
                  <span className="text-sm text-blue-400">
                    ({(answersFile.size / 1024).toFixed(1)} KB)
                  </span>
                </div>
              ) : (
                <>
                  <FiUpload className="text-2xl text-blue-300 mx-auto mb-1" />
                  <p className="text-blue-400 text-sm">
                    Drop the Answers PDF here (optional)
                  </p>
                </>
              )}
            </div>
          )}

          {/* Options */}
          <div className="grid sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Topic Override (optional)
              </label>
              <select
                value={topicOverride}
                onChange={(e) => setTopicOverride(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                <option value="">Auto-detect</option>
                {TOPICS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Source Label
              </label>
              <input
                type="text"
                value={source}
                onChange={(e) => setSource(e.target.value)}
                placeholder="e.g., Kaplan Practice Exam 1"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleUpload}
              disabled={(!file && !answersFile) || loading}
              className="bg-cfa-gold hover:bg-cfa-gold-light text-cfa-navy font-bold px-6 py-2.5 rounded-lg disabled:opacity-50"
            >
              {loading ? "Parsing..." : "Parse PDF"}
            </button>
            {(file || answersFile || parsedQuestions.length > 0) && (
              <button
                onClick={resetUpload}
                className="text-gray-500 hover:text-gray-700 px-4 py-2.5 text-sm"
              >
                Reset
              </button>
            )}
          </div>
        </section>

        {/* Parse Stats & Warnings */}
        {parseStats && (
          <section className="bg-white rounded-xl border border-gray-200 p-6 mb-8">
            <h3 className="font-bold text-cfa-navy mb-3">Parse Results</h3>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
              <div className="bg-blue-50 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-blue-700">{parseStats.totalParsed}</div>
                <div className="text-xs text-blue-600">Total Parsed</div>
              </div>
              <div className="bg-green-50 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-green-700">{parseStats.validCount}</div>
                <div className="text-xs text-green-600">Valid</div>
              </div>
              <div className="bg-yellow-50 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-yellow-700">{warningCount}</div>
                <div className="text-xs text-yellow-600">With Warnings</div>
              </div>
              <div className="bg-orange-50 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-orange-700">{parseStats.duplicateCount}</div>
                <div className="text-xs text-orange-600">Duplicates</div>
              </div>
            </div>

            {parseStats.warnings.length > 0 && (
              <div>
                <button
                  onClick={() => setShowWarnings(!showWarnings)}
                  className="flex items-center gap-2 text-sm text-yellow-700 hover:text-yellow-800"
                >
                  <FiAlertTriangle />
                  {showWarnings ? "Hide" : "Show"} {parseStats.warnings.length} warnings
                </button>
                {showWarnings && (
                  <div className="mt-2 max-h-40 overflow-y-auto bg-yellow-50 rounded-lg p-3">
                    {parseStats.warnings.map((w, i) => (
                      <div key={i} className="text-xs text-yellow-800 py-0.5">{w}</div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {/* Parsed Questions */}
        {parsedQuestions.length > 0 && (
          <section className="mb-8">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
              <h2 className="font-bold text-cfa-navy">
                Parsed Questions ({parsedQuestions.length})
              </h2>
              <div className="flex items-center gap-2">
                {/* Filter tabs */}
                <div className="flex gap-1 mr-3">
                  <button
                    onClick={() => setFilterMode("all")}
                    className={`px-2 py-1 rounded text-xs ${
                      filterMode === "all" ? "bg-cfa-navy text-white" : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    All ({parsedQuestions.length})
                  </button>
                  <button
                    onClick={() => setFilterMode("valid")}
                    className={`px-2 py-1 rounded text-xs ${
                      filterMode === "valid" ? "bg-green-600 text-white" : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    Valid ({validCount})
                  </button>
                  {warningCount > 0 && (
                    <button
                      onClick={() => setFilterMode("warnings")}
                      className={`px-2 py-1 rounded text-xs ${
                        filterMode === "warnings" ? "bg-yellow-600 text-white" : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      Warnings ({warningCount})
                    </button>
                  )}
                </div>
                <button
                  onClick={saveQuestions}
                  disabled={saving || validCount === 0 || (tab === "mock" && !mockName.trim())}
                  className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 flex items-center gap-2 disabled:opacity-50 text-sm"
                >
                  <FiSave />
                  {saving
                    ? "Saving..."
                    : tab === "mock"
                    ? `Save ${validCount} & Add to Mock`
                    : `Save ${validCount} Valid Questions`}
                </button>
              </div>
            </div>

            <div className="space-y-4">
              {filteredQuestions.map((q, filteredIndex) => {
                const realIndex = parsedQuestions.indexOf(q);
                const hasWarnings = q.warnings && q.warnings.length > 0;

                return (
                  <div
                    key={realIndex}
                    className={`bg-white rounded-xl border p-4 ${
                      hasWarnings ? "border-yellow-300" : "border-gray-200"
                    }`}
                  >
                    {/* Warnings banner */}
                    {hasWarnings && (
                      <div className="mb-3 bg-yellow-50 rounded-lg p-2">
                        {q.warnings!.map((w, wi) => (
                          <div key={wi} className="text-xs text-yellow-700 flex items-center gap-1">
                            <FiAlertTriangle className="shrink-0" />
                            {w}
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="flex items-start justify-between gap-4 mb-3">
                      <span className="text-sm font-medium text-gray-800">
                        Q{realIndex + 1}
                        {parseStats?.duplicateIndices.includes(realIndex) && (
                          <span className="ml-2 text-xs text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded">
                            DUPLICATE
                          </span>
                        )}
                      </span>
                      <button
                        onClick={() => removeQuestion(realIndex)}
                        className="text-red-400 hover:text-red-600 p-1"
                      >
                        <FiTrash2 />
                      </button>
                    </div>

                    <textarea
                      value={q.text}
                      onChange={(e) => updateQuestion(realIndex, "text", e.target.value)}
                      className="w-full text-sm border border-gray-200 rounded-lg p-2 mb-2 resize-y"
                      rows={2}
                    />

                    <div className="grid sm:grid-cols-3 gap-2 mb-2">
                      <input
                        value={q.optionA}
                        onChange={(e) => updateQuestion(realIndex, "optionA", e.target.value)}
                        className="text-xs border border-gray-200 rounded-lg p-2"
                        placeholder="Option A"
                      />
                      <input
                        value={q.optionB}
                        onChange={(e) => updateQuestion(realIndex, "optionB", e.target.value)}
                        className="text-xs border border-gray-200 rounded-lg p-2"
                        placeholder="Option B"
                      />
                      <input
                        value={q.optionC}
                        onChange={(e) => updateQuestion(realIndex, "optionC", e.target.value)}
                        className="text-xs border border-gray-200 rounded-lg p-2"
                        placeholder="Option C"
                      />
                    </div>

                    <div className="flex gap-2 flex-wrap items-center">
                      <select
                        value={q.correctAnswer || ""}
                        onChange={(e) =>
                          updateQuestion(realIndex, "correctAnswer", e.target.value)
                        }
                        className={`text-xs border rounded-lg px-2 py-1 ${
                          !q.correctAnswer ? "border-red-300 bg-red-50" : "border-gray-200"
                        }`}
                      >
                        <option value="">No answer</option>
                        <option value="A">A</option>
                        <option value="B">B</option>
                        <option value="C">C</option>
                      </select>
                      <select
                        value={q.topic}
                        onChange={(e) => updateQuestion(realIndex, "topic", e.target.value)}
                        className="text-xs border border-gray-200 rounded-lg px-2 py-1 flex-1"
                      >
                        {TOPICS.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                      {q.explanation && (
                        <span className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded">
                          Has explanation
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
