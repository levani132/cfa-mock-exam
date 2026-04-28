"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  FiArrowLeft,
  FiAward,
  FiBook,
  FiCheckCircle,
  FiCalendar,
  FiMessageCircle,
  FiHeart,
  FiTrash2,
} from "react-icons/fi";

interface UserStats {
  totalExams: number;
  totalQuestions: number;
  correctAnswers: number;
  averageScore: number;
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
  };
  stats: UserStats;
}

interface Post {
  _id: string;
  userId: number;
  userName: string;
  content: string;
  likes: number;
  likedBy: number[];
  createdAt: string;
}

export default function UserProfilePage() {
  const params = useParams();
  const router = useRouter();
  const userId = params.userId as string;

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [likedPosts, setLikedPosts] = useState<Set<string>>(new Set());

  useEffect(() => {
    const stored = localStorage.getItem("cfa_user_id");
    setCurrentUserId(stored);

    const fetchData = async () => {
      try {
        const [profileRes, postsRes] = await Promise.all([
          fetch(`/api/users/${userId}`),
          fetch(`/api/posts?userId=${userId}`),
        ]);

        if (profileRes.ok) {
          const profileData = await profileRes.json();
          setProfile(profileData);
        }

        if (postsRes.ok) {
          const postsData = await postsRes.json();
          setPosts(postsData);

          // Determine which posts are liked by current user
          if (stored) {
            const currentUserIdNum = parseInt(stored, 10);
            const liked = new Set(
              postsData
                .filter((post: Post) => post.likedBy.includes(currentUserIdNum))
                .map((post: Post) => post._id)
            );
            setLikedPosts(liked);
          }
        }
      } catch (err) {
        console.error("Failed to fetch profile:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [userId]);

  const handleLike = async (postId: string) => {
    if (!currentUserId) {
      alert("Please log in to like posts");
      return;
    }

    try {
      const isLiked = likedPosts.has(postId);
      const res = await fetch(`/api/posts/${postId}/like`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: currentUserId,
          action: isLiked ? "unlike" : "like",
        }),
      });

      if (res.ok) {
        const updatedPost = await res.json();
        setPosts((prev) =>
          prev.map((p) => (p._id === postId ? updatedPost : p))
        );

        setLikedPosts((prev) => {
          const newSet = new Set(prev);
          if (isLiked) {
            newSet.delete(postId);
          } else {
            newSet.add(postId);
          }
          return newSet;
        });
      }
    } catch (err) {
      console.error("Failed to like post:", err);
    }
  };

  const handleDeletePost = async (postId: string) => {
    if (!confirm("Delete this post?")) return;

    try {
      const res = await fetch(`/api/posts/${postId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: currentUserId }),
      });

      if (res.ok) {
        setPosts((prev) => prev.filter((p) => p._id !== postId));
      } else {
        alert("Failed to delete post");
      }
    } catch (err) {
      console.error("Failed to delete post:", err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cfa-navy mx-auto mb-4"></div>
          <p className="text-gray-600">Loading profile...</p>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <FiArrowLeft className="h-12 w-12 text-gray-400 mx-auto mb-4" />
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

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-cfa-navy text-white shadow-lg">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center gap-4">
          <button
            onClick={() => router.back()}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <FiArrowLeft className="h-6 w-6" />
          </button>
          <div>
            <h1 className="text-xl font-bold">{user.name}</h1>
            <p className="text-sm text-gray-300">
              Member since{" "}
              {new Date(user.createdAt).toLocaleDateString("en-US", {
                year: "numeric",
                month: "short",
              })}
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          {/* Total Exams */}
          <div className="bg-white rounded-xl shadow-sm p-6 border-l-4 border-cfa-navy">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-500 text-sm font-medium">Exams Taken</p>
                <p className="text-3xl font-bold text-cfa-navy mt-2">
                  {stats.totalExams}
                </p>
              </div>
              <FiBook className="h-10 w-10 text-cfa-navy/20" />
            </div>
          </div>

          {/* Average Score */}
          <div className="bg-white rounded-xl shadow-sm p-6 border-l-4 border-emerald-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-500 text-sm font-medium">
                  Average Score
                </p>
                <p className="text-3xl font-bold text-emerald-600 mt-2">
                  {stats.averageScore}%
                </p>
              </div>
              <FiAward className="h-10 w-10 text-emerald-500/20" />
            </div>
          </div>

          {/* Correct Answers */}
          <div className="bg-white rounded-xl shadow-sm p-6 border-l-4 border-blue-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-500 text-sm font-medium">
                  Correct Answers
                </p>
                <p className="text-3xl font-bold text-blue-600 mt-2">
                  {stats.correctAnswers}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  of {stats.totalQuestions}
                </p>
              </div>
              <FiCheckCircle className="h-10 w-10 text-blue-500/20" />
            </div>
          </div>

          {/* Member Since */}
          <div className="bg-white rounded-xl shadow-sm p-6 border-l-4 border-amber-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-500 text-sm font-medium">Member Since</p>
                <p className="text-lg font-bold text-amber-600 mt-2">
                  {new Date(user.createdAt).toLocaleDateString("en-US", {
                    month: "short",
                    year: "numeric",
                  })}
                </p>
              </div>
              <FiCalendar className="h-10 w-10 text-amber-500/20" />
            </div>
          </div>
        </div>

        {/* Topic Breakdown */}
        {stats.topicBreakdown.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm p-6 mb-8">
            <h2 className="text-lg font-bold text-cfa-navy mb-6">
              Topic Performance
            </h2>
            <div className="space-y-4">
              {stats.topicBreakdown.map((topic) => (
                <div key={topic.topic}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-gray-700">
                      {topic.topic}
                    </span>
                    <span className="text-sm font-semibold text-cfa-navy">
                      {topic.correct}/{topic.total} ({topic.percentage}%)
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-linear-to-r from-cfa-navy to-cfa-navy-light h-2 rounded-full transition-all"
                      style={{ width: `${topic.percentage}%` }}
                    ></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* User Posts */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <div className="flex items-center gap-2 mb-6">
            <FiMessageCircle className="h-6 w-6 text-cfa-navy" />
            <h2 className="text-lg font-bold text-cfa-navy">Posts</h2>
            {posts.length > 0 && (
              <span className="ml-auto text-sm text-gray-500">
                {posts.length} post{posts.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>

          {posts.length === 0 ? (
            <p className="text-center text-gray-400 py-8">
              This user hasn't posted yet
            </p>
          ) : (
            <div className="space-y-4">
              {posts.map((post) => (
                <div
                  key={post._id}
                  className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-semibold text-cfa-navy">
                        {post.userName}
                      </h3>
                      <p className="text-xs text-gray-400">
                        {new Date(post.createdAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                    {parseInt(currentUserId || "0") === post.userId && (
                      <button
                        onClick={() => handleDeletePost(post._id)}
                        className="p-2 hover:bg-red-50 rounded-lg text-red-500 transition-colors"
                      >
                        <FiTrash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>

                  <p className="text-gray-700 mb-4 whitespace-pre-wrap">
                    {post.content}
                  </p>

                  <button
                    onClick={() => handleLike(post._id)}
                    className={`flex items-center gap-1 px-3 py-1.5 rounded-lg transition-colors ${
                      likedPosts.has(post._id)
                        ? "bg-red-50 text-red-500"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    <FiHeart
                      className={`h-4 w-4 ${
                        likedPosts.has(post._id) ? "fill-current" : ""
                      }`}
                    />
                    <span className="text-sm font-medium">{post.likes}</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
