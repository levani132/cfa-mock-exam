"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { FiBookOpen, FiClock, FiAward, FiArrowRight, FiHeart } from "react-icons/fi";
import UserSearchBar from "@/components/UserSearchBar";
import PostsFeed from "@/components/PostsFeed";

export default function HomePage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem("cfa_user_id");
    const storedName = localStorage.getItem("cfa_user_name");
    if (stored) setUserId(stored);
    if (storedName) setUserName(storedName);
  }, []);

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-cfa-navy text-white shadow-lg">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center gap-4">
            {/* Logo */}
            <div className="flex items-center gap-3 shrink-0">
              <div className="w-10 h-10 bg-cfa-gold rounded-lg flex items-center justify-center font-bold text-cfa-navy text-lg">
                CFA
              </div>
              <span className="text-lg font-semibold hidden sm:inline">Level 1 Mock Exam</span>
            </div>
            {/* Search — centered flex-grow */}
            <div className="flex-1 max-w-md mx-auto">
              <UserSearchBar />
            </div>
            {/* User actions */}
            <div className="flex items-center gap-4 shrink-0">
              {userId ? (
                <>
                  <span className="text-sm text-gray-300 hidden md:inline">
                    Welcome, <span className="text-cfa-gold font-medium">{userName}</span>
                  </span>
                  <button
                    onClick={() => router.push("/history")}
                    className="text-sm px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors whitespace-nowrap"
                  >
                    My History
                  </button>
                </>
              ) : (
                <button
                  onClick={() => router.push("/login")}
                  className="text-sm px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
                >
                  Log In
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1">
        <section className="bg-linear-to-br from-cfa-navy via-cfa-navy-light to-cfa-navy text-white py-20">
          <div className="max-w-4xl mx-auto px-6 text-center">
            <div className="mb-6">
              <span className="inline-block bg-cfa-gold/20 text-cfa-gold px-4 py-1.5 rounded-full text-sm font-medium border border-cfa-gold/30">
                ✨ Made with love for Ana Tatanashvili
              </span>
            </div>
            <h1 className="text-5xl font-bold mb-4">
              Your CFA Level 1
              <span className="block text-cfa-gold mt-2">Study Companion</span>
            </h1>
            <p className="text-lg text-gray-300 max-w-2xl mx-auto mb-8">
              Practice with realistic mock exams, track your progress, and build confidence
              for exam day. You&apos;ve got this! 💪
            </p>
            <div className="flex items-center justify-center gap-4 flex-wrap">
              <button
                onClick={() => {
                  if (userId) {
                    router.push("/exam/setup");
                  } else {
                    router.push("/login");
                  }
                }}
                className="bg-cfa-gold hover:bg-cfa-gold-light text-cfa-navy font-semibold px-8 py-3.5 rounded-xl text-lg transition-all hover:shadow-lg hover:shadow-cfa-gold/25 flex items-center gap-2"
              >
                Start Practicing <FiArrowRight />
              </button>
              {!userId && (
                <button
                  onClick={() => router.push("/login")}
                  className="border border-white/30 hover:border-white/60 text-white px-8 py-3.5 rounded-xl text-lg transition-colors"
                >
                  Enter Your ID
                </button>
              )}
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="py-16 bg-white">
          <div className="max-w-5xl mx-auto px-6">
            <h2 className="text-2xl font-bold text-center text-cfa-navy mb-12">
              Everything You Need to Prepare
            </h2>
            <div className="grid md:grid-cols-3 gap-8">
              <FeatureCard
                icon={<FiBookOpen className="text-2xl" />}
                title="Full Mock Exams"
                description="180 questions, two sessions with a break — just like the real CFA Level 1 exam. Time pressure included."
              />
              <FeatureCard
                icon={<FiClock className="text-2xl" />}
                title="Custom Practice"
                description="Choose specific topics, set your own time, and focus on your weak areas. Flexible and tailored to your needs."
              />
              <FeatureCard
                icon={<FiAward className="text-2xl" />}
                title="Track Progress"
                description="Review your scores, see topic breakdowns, and track improvement over time. Every attempt makes you stronger."
              />
            </div>
          </div>
        </section>

        {/* Topic Overview */}
        <section className="py-16 bg-gray-50">
          <div className="max-w-5xl mx-auto px-6">
            <h2 className="text-2xl font-bold text-center text-cfa-navy mb-8">
              10 CFA Level 1 Topics
            </h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[
                { name: "Ethics & Professional Standards", weight: "15–20%" },
                { name: "Quantitative Methods", weight: "6–9%" },
                { name: "Economics", weight: "6–9%" },
                { name: "Financial Statement Analysis", weight: "11–14%" },
                { name: "Corporate Issuers", weight: "6–9%" },
                { name: "Equity Investments", weight: "11–14%" },
                { name: "Fixed Income", weight: "11–14%" },
                { name: "Derivatives", weight: "5–8%" },
                { name: "Alternative Investments", weight: "5–8%" },
                { name: "Portfolio Management", weight: "5–8%" },
              ].map((topic) => (
                <div
                  key={topic.name}
                  className="bg-white rounded-lg p-4 border border-gray-200 flex items-center justify-between hover:border-cfa-gold/50 transition-colors"
                >
                  <span className="text-sm font-medium text-gray-800">{topic.name}</span>
                  <span className="text-xs font-mono bg-cfa-navy/5 text-cfa-navy px-2 py-1 rounded">
                    {topic.weight}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Dedication */}
        <section className="py-12 bg-white">
          <div className="max-w-xl mx-auto px-6 text-center">
            <div className="bg-linear-to-r from-cfa-navy to-cfa-navy-light rounded-2xl p-8 text-white">
              <FiHeart className="text-cfa-gold text-3xl mx-auto mb-4" />
              <p className="text-lg italic mb-2">
                &ldquo;Behind every successful CFA candidate is someone who never stopped believing in them.&rdquo;
              </p>
              <p className="text-cfa-gold font-medium">
                For Ana — you&apos;re going to crush this exam! 🌟
              </p>
            </div>
          </div>
        </section>

        {/* Community Wall */}
        <section className="py-16 bg-gray-50">
          <div className="max-w-4xl mx-auto px-6">
            <h2 className="text-2xl font-bold text-cfa-navy mb-2">
              Community Wall
            </h2>
            <p className="text-gray-600 mb-8">
              Share your study journey, tips, and encouragement with fellow CFA candidates
            </p>
            <PostsFeed />
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-cfa-navy text-gray-400 py-6">
        <div className="max-w-6xl mx-auto px-6 text-center text-sm">
          <p>CFA® and Chartered Financial Analyst® are trademarks owned by CFA Institute.</p>
          <p className="mt-1">This is a personal study tool, not affiliated with CFA Institute.</p>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="bg-gray-50 rounded-xl p-6 border border-gray-200 hover:border-cfa-gold/40 hover:shadow-md transition-all">
      <div className="w-12 h-12 bg-cfa-navy/10 text-cfa-navy rounded-lg flex items-center justify-center mb-4">
        {icon}
      </div>
      <h3 className="font-semibold text-cfa-navy mb-2">{title}</h3>
      <p className="text-sm text-gray-600 leading-relaxed">{description}</p>
    </div>
  );
}
