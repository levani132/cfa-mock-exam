"use client";

import { useState, useEffect, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  FiArrowLeft,
  FiAward,
  FiBook,
  FiCheckCircle,
  FiCalendar,
  FiTarget,
  FiTrendingUp,
} from "react-icons/fi";
import PostsFeed from "@/components/PostsFeed";

interface UserStats {
  totalExams: number;
  totalQuestions: number;
  correctAnswers: number;
  averageScore: number;
  totalQuestionsInDB: number;
  topicBreakdown: Array<{
    topic: string;
    correct: number;
    total: number;
    percentage: number;
  }>;
}

interface UserProfile {
  user: {
    numericId: number;
    name: string;
    createdAt: string;
    profilePicture?: string | null;
    coverPicture?: string | null;
    description?: string | null;
  };
  stats: UserStats;
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function getScoreColor(pct: number) {
  if (pct >= 70) return "text-emerald-600";
  if (pct >= 50) return "text-amber-600";
  return "text-red-500";
}

function getBarColor(pct: number) {
  if (pct >= 70) return "from-emerald-400 to-emerald-600";
  if (pct >= 50) return "from-amber-400 to-amber-600";
  return "from-red-400 to-red-500";
}

export default function UserProfilePage() {
  const params = useParams<{ userId: string }>();
  const router = useRouter();
  const userId = params.userId;

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const currentUserId = useMemo(
    () => (typeof window !== "undefined" ? localStorage.getItem("cfa_user_id") : null),
    []
  );

  useEffect(() => {
    fetch(`/api/users/${userId}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then((data: UserProfile) => setProfile(data))
      .catch((err) => console.error("Failed to fetch profile:", err))
      .finally(() => setLoading(false));
  }, [userId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cfa-navy mx-auto mb-4" />
          <p className="text-gray-600">Loading profile...</p>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 mb-4">User not found</p>
          <button
            onClick={() => router.back()}
            className="text-cfa-navy hover:text-cfa-navy-light font-medium"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const { user, stats } = profile;
  const progressPct =
    stats.totalQuestionsInDB > 0
      ? Math.round((stats.totalQuestions / stats.totalQuestionsInDB) * 100)
      : 0;
  const isOwn = currentUserId === String(user.numericId);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <header className="bg-cfa-navy text-white shadow-lg sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center gap-4">
          <button
            onClick={() => router.back()}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <FiArrowLeft className="h-5 w-5" />
          </button>
          <span className="font-semibold text-lg">{user.name}&apos;s Profile</span>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-8 flex flex-col lg:flex-row gap-8 items-start">
        {/* ── LEFT SIDEBAR ── */}
        <aside className="w-full lg:w-80 shrink-0 space-y-5 lg:sticky lg:top-24">
          {/* Avatar card */}
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            {/* Cover Banner */}
            <div
              className="h-24 bg-linear-to-r from-cfa-navy to-cfa-navy-light bg-cover bg-center"
              style={
                user.coverPicture
                  ? { backgroundImage: `url('${user.coverPicture}')` }
                  : {}
              }
            />
            <div className="px-6 pb-6">
              {/* Profile Picture */}
              <div className="-mt-10 mb-4">
                {user.profilePicture ? (
                  <img
                    src={user.profilePicture}
                    alt={user.name}
                    className="h-20 w-20 rounded-full border-4 border-white shadow-md object-cover"
                  />
                ) : (
                  <div className="h-20 w-20 rounded-full bg-cfa-navy border-4 border-white flex items-center justify-center shadow-md">
                    <span className="text-white font-bold text-2xl">
                      {getInitials(user.name)}
                    </span>
                  </div>
                )}
              </div>
              <h2 className="text-xl font-bold text-gray-900">{user.name}</h2>
              {user.description && (
                <p className="text-sm text-gray-600 mt-2 leading-relaxed">
                  {user.description}
                </p>
              )}
              <p className="text-sm text-gray-500 flex items-center gap-1 mt-2">
                <FiCalendar className="h-3.5 w-3.5" />
                Member since{" "}
                {new Date(user.createdAt).toLocaleDateString("en-US", {
                  month: "long",
                  year: "numeric",
                })}
              </p>
              {isOwn && (
                <span className="inline-block mt-3 text-xs bg-cfa-navy/10 text-cfa-navy font-semibold px-3 py-1 rounded-full">
                  Your Profile
                </span>
              )}
            </div>
          </div>

          {/* Quick stats */}
          <div className="bg-white rounded-2xl shadow-sm p-5 space-y-4">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Stats
            </h3>

            <div className="flex items-center gap-3">
              <div className="p-2 bg-cfa-navy/10 rounded-lg">
                <FiBook className="h-5 w-5 text-cfa-navy" />
              </div>
              <div>
                <p className="text-xs text-gray-500">Exams taken</p>
                <p className="text-xl font-bold text-gray-900">{stats.totalExams}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-50 rounded-lg">
                <FiAward className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500">Average score</p>
                <p className={`text-xl font-bold ${getScoreColor(stats.averageScore)}`}>
                  {stats.averageScore}%
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-50 rounded-lg">
                <FiCheckCircle className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500">Correct answers</p>
                <p className="text-xl font-bold text-gray-900">
                  {stats.correctAnswers.toLocaleString()}{" "}
                  <span className="text-sm font-normal text-gray-400">
                    / {stats.totalQuestions.toLocaleString()}
                  </span>
                </p>
              </div>
            </div>
          </div>

          {/* Overall question bank progress */}
          <div className="bg-white rounded-2xl shadow-sm p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="p-2 bg-purple-50 rounded-lg">
                <FiTarget className="h-5 w-5 text-purple-600" />
              </div>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Question Bank Progress
              </h3>
            </div>

            <div className="flex items-end justify-between mb-2">
              <span className="text-3xl font-bold text-gray-900">
                {progressPct}
                <span className="text-base font-normal text-gray-400">%</span>
              </span>
              <span className="text-sm text-gray-500 text-right">
                {stats.totalQuestions.toLocaleString()}
                <span className="block text-xs text-gray-400">
                  of {stats.totalQuestionsInDB.toLocaleString()} Qs
                </span>
              </span>
            </div>

            <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
              <div
                className="h-3 rounded-full bg-linear-to-r from-purple-500 to-purple-700 transition-all duration-500"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <p className="text-xs text-gray-400 mt-2 leading-relaxed">
              Questions attempted from the entire question bank
            </p>
          </div>
        </aside>

        {/* ── RIGHT MAIN ── */}
        <main className="flex-1 min-w-0 space-y-6">
          {/* Topic breakdown */}
          {stats.topicBreakdown.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm p-6">
              <div className="flex items-center gap-2 mb-6">
                <FiTrendingUp className="h-5 w-5 text-cfa-navy" />
                <h2 className="text-base font-bold text-gray-900">Topic Performance</h2>
              </div>
              <div className="space-y-4">
                {stats.topicBreakdown.map((topic) => (
                  <div key={topic.topic}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm font-medium text-gray-700">
                        {topic.topic}
                      </span>
                      <span className={`text-sm font-semibold tabular-nums ${getScoreColor(topic.percentage)}`}>
                        {topic.correct}/{topic.total}
                        <span className="ml-1 font-normal text-gray-400">
                          ({topic.percentage}%)
                        </span>
                      </span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                      <div
                        className={`h-2 rounded-full bg-linear-to-r ${getBarColor(topic.percentage)} transition-all duration-500`}
                        style={{ width: `${topic.percentage}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Posts wall — reuses PostsFeed so comments work too */}
          <div className="bg-white rounded-2xl shadow-sm p-6">
            <h2 className="text-base font-bold text-gray-900 mb-6">Posts</h2>
            <PostsFeed userId={user.numericId} />
          </div>
        </main>
      </div>
    </div>
  );
}

