"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FiArrowLeft, FiUser, FiHash } from "react-icons/fi";

export default function LoginPage() {
  const router = useRouter();
  const [numericId, setNumericId] = useState("");
  const [name, setName] = useState("");
  const [step, setStep] = useState<"id" | "name">("id");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleIdSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const id = parseInt(numericId, 10);
    if (isNaN(id) || id < 1) {
      setError("Please enter a valid numeric ID (e.g., 1234)");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/user?id=${id}`);
      const data = await res.json();

      if (data.exists) {
        // Existing user — log them in
        localStorage.setItem("cfa_user_id", String(data.user.numericId));
        localStorage.setItem("cfa_user_name", data.user.name);
        router.push("/exam/setup");
      } else {
        // New user — ask for name
        setStep("name");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleNameSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!name.trim()) {
      setError("Please enter your name");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ numericId: parseInt(numericId, 10), name: name.trim() }),
      });
      const data = await res.json();

      if (res.ok) {
        localStorage.setItem("cfa_user_id", String(data.user.numericId));
        localStorage.setItem("cfa_user_name", data.user.name);
        router.push("/exam/setup");
      } else {
        setError(data.error || "Failed to create account");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-cfa-navy via-cfa-navy-light to-cfa-navy flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <button
          onClick={() => router.push("/")}
          className="text-gray-300 hover:text-white flex items-center gap-2 mb-8 text-sm transition-colors"
        >
          <FiArrowLeft /> Back to Home
        </button>

        <div className="bg-white rounded-2xl shadow-xl p-8">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-cfa-navy rounded-xl flex items-center justify-center mx-auto mb-4">
              <FiUser className="text-cfa-gold text-2xl" />
            </div>
            <h1 className="text-2xl font-bold text-cfa-navy">
              {step === "id" ? "Enter Your ID" : "Welcome, New User!"}
            </h1>
            <p className="text-gray-500 text-sm mt-2">
              {step === "id"
                ? "Use your numeric ID to sign in or create a new account"
                : "Let's set up your profile"}
            </p>
          </div>

          {step === "id" ? (
            <form onSubmit={handleIdSubmit}>
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Numeric ID
                </label>
                <div className="relative">
                  <FiHash className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="number"
                    value={numericId}
                    onChange={(e) => setNumericId(e.target.value)}
                    placeholder="e.g., 1234"
                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-cfa-gold focus:border-cfa-gold outline-none text-lg"
                    autoFocus
                    min="1"
                  />
                </div>
              </div>

              {error && (
                <div className="mb-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-cfa-navy hover:bg-cfa-navy-light text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-50"
              >
                {loading ? "Checking..." : "Continue"}
              </button>
            </form>
          ) : (
            <form onSubmit={handleNameSubmit}>
              <div className="mb-4 p-3 bg-cfa-gold/10 text-cfa-navy text-sm rounded-lg">
                ID <strong>#{numericId}</strong> is available! Enter your name to create your account.
              </div>

              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Your Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Ana"
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-cfa-gold focus:border-cfa-gold outline-none text-lg"
                  autoFocus
                  maxLength={50}
                />
              </div>

              {error && (
                <div className="mb-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg">
                  {error}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setStep("id");
                    setError("");
                  }}
                  className="flex-1 border border-gray-300 text-gray-600 font-semibold py-3 rounded-xl hover:bg-gray-50 transition-colors"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 bg-cfa-gold hover:bg-cfa-gold-light text-cfa-navy font-semibold py-3 rounded-xl transition-colors disabled:opacity-50"
                >
                  {loading ? "Creating..." : "Create Account"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
