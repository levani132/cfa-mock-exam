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
} from "react-icons/fi";

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
  correctAnswer: "A" | "B" | "C";
  topic: string;
  explanation?: string;
}

export default function UploadPage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [password, setPassword] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [topicOverride, setTopicOverride] = useState("");
  const [source, setSource] = useState("");
  const [loading, setLoading] = useState(false);
  const [parsedQuestions, setParsedQuestions] = useState<ParsedQuestion[]>([]);
  const [extractedText, setExtractedText] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedCount, setSavedCount] = useState(0);
  const [error, setError] = useState("");
  const [seedLoading, setSeedLoading] = useState(false);
  const [seedResult, setSeedResult] = useState("");

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
    if (!file) return;
    setLoading(true);
    setError("");

    const formData = new FormData();
    formData.append("pdf", file);
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
      setExtractedText(data.extractedText || "");
    } catch {
      setError("Upload failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function saveQuestions() {
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
          questions: parsedQuestions,
          source: source || file?.name || "PDF Upload",
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
      setParsedQuestions([]);
    } catch {
      setError("Save failed. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function seedDatabase() {
    setSeedLoading(true);
    setSeedResult("");
    setError("");

    try {
      const res = await fetch("/api/seed", {
        method: "POST",
        headers: { "x-admin-password": password },
      });
      const data = await res.json();

      if (res.ok) {
        setSeedResult(data.message || `Seeded ${data.inserted} questions!`);
      } else {
        setError(data.error || "Seed failed");
      }
    } catch {
      setError("Seed failed. Please try again.");
    } finally {
      setSeedLoading(false);
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

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-cfa-navy to-cfa-navy-light flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <button
            onClick={() => router.push("/")}
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
      <header className="bg-cfa-navy text-white shadow-lg">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center gap-4">
          <button
            onClick={() => router.push("/")}
            className="text-gray-300 hover:text-white transition-colors"
          >
            <FiArrowLeft className="text-xl" />
          </button>
          <div className="flex items-center gap-3">
            <FiUpload className="text-cfa-gold text-xl" />
            <h1 className="text-lg font-semibold">Upload Questions</h1>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-8">
        {error && (
          <div className="mb-6 p-4 bg-red-50 text-red-600 rounded-xl text-sm">{error}</div>
        )}

        {savedCount > 0 && (
          <div className="mb-6 p-4 bg-green-50 text-green-700 rounded-xl text-sm flex items-center gap-2">
            <FiCheck /> Saved {savedCount} questions to the database!
          </div>
        )}

        {seedResult && (
          <div className="mb-6 p-4 bg-blue-50 text-blue-700 rounded-xl text-sm flex items-center gap-2">
            <FiCheck /> {seedResult}
          </div>
        )}

        {/* Seed Section */}
        <section className="bg-white rounded-xl border border-gray-200 p-6 mb-8">
          <h2 className="font-bold text-cfa-navy mb-3">Seed Sample Questions</h2>
          <p className="text-sm text-gray-500 mb-4">
            Populate the database with 28 sample questions across all 10 topics.
          </p>
          <button
            onClick={seedDatabase}
            disabled={seedLoading}
            className="bg-cfa-navy text-white px-6 py-2 rounded-lg hover:bg-cfa-navy-light disabled:opacity-50"
          >
            {seedLoading ? "Seeding..." : "Seed Database"}
          </button>
        </section>

        {/* Upload Section */}
        <section className="bg-white rounded-xl border border-gray-200 p-6 mb-8">
          <h2 className="font-bold text-cfa-navy mb-4">Upload PDF</h2>

          {/* Drop zone */}
          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => fileRef.current?.click()}
            className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-cfa-gold/50 transition-colors mb-4"
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
                <FiUpload className="text-3xl text-gray-400 mx-auto mb-2" />
                <p className="text-gray-500">
                  Drop a PDF here or click to browse
                </p>
              </>
            )}
          </div>

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

          <button
            onClick={handleUpload}
            disabled={!file || loading}
            className="bg-cfa-gold hover:bg-cfa-gold-light text-cfa-navy font-bold px-6 py-2.5 rounded-lg disabled:opacity-50"
          >
            {loading ? "Parsing..." : "Parse PDF"}
          </button>
        </section>

        {/* Extracted text preview */}
        {extractedText && (
          <section className="bg-white rounded-xl border border-gray-200 p-6 mb-8">
            <h3 className="font-bold text-cfa-navy mb-2">Extracted Text Preview</h3>
            <pre className="text-xs text-gray-500 bg-gray-50 p-4 rounded-lg max-h-48 overflow-y-auto whitespace-pre-wrap">
              {extractedText}
            </pre>
          </section>
        )}

        {/* Parsed Questions */}
        {parsedQuestions.length > 0 && (
          <section className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-cfa-navy">
                Parsed Questions ({parsedQuestions.length})
              </h2>
              <button
                onClick={saveQuestions}
                disabled={saving}
                className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 flex items-center gap-2 disabled:opacity-50"
              >
                <FiSave /> {saving ? "Saving..." : "Save All to Database"}
              </button>
            </div>

            <div className="space-y-4">
              {parsedQuestions.map((q, i) => (
                <div
                  key={i}
                  className="bg-white rounded-xl border border-gray-200 p-4"
                >
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <span className="text-sm font-medium text-gray-800">
                      Q{i + 1}
                    </span>
                    <button
                      onClick={() => removeQuestion(i)}
                      className="text-red-400 hover:text-red-600 p-1"
                    >
                      <FiTrash2 />
                    </button>
                  </div>

                  <textarea
                    value={q.text}
                    onChange={(e) => updateQuestion(i, "text", e.target.value)}
                    className="w-full text-sm border border-gray-200 rounded-lg p-2 mb-2 resize-y"
                    rows={2}
                  />

                  <div className="grid sm:grid-cols-3 gap-2 mb-2">
                    <input
                      value={q.optionA}
                      onChange={(e) => updateQuestion(i, "optionA", e.target.value)}
                      className="text-xs border border-gray-200 rounded-lg p-2"
                      placeholder="Option A"
                    />
                    <input
                      value={q.optionB}
                      onChange={(e) => updateQuestion(i, "optionB", e.target.value)}
                      className="text-xs border border-gray-200 rounded-lg p-2"
                      placeholder="Option B"
                    />
                    <input
                      value={q.optionC}
                      onChange={(e) => updateQuestion(i, "optionC", e.target.value)}
                      className="text-xs border border-gray-200 rounded-lg p-2"
                      placeholder="Option C"
                    />
                  </div>

                  <div className="flex gap-2 flex-wrap">
                    <select
                      value={q.correctAnswer}
                      onChange={(e) =>
                        updateQuestion(i, "correctAnswer", e.target.value)
                      }
                      className="text-xs border border-gray-200 rounded-lg px-2 py-1"
                    >
                      <option value="A">A</option>
                      <option value="B">B</option>
                      <option value="C">C</option>
                    </select>
                    <select
                      value={q.topic}
                      onChange={(e) => updateQuestion(i, "topic", e.target.value)}
                      className="text-xs border border-gray-200 rounded-lg px-2 py-1 flex-1"
                    >
                      {TOPICS.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
