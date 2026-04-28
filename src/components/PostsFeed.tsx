"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  FiMessageCircle,
  FiHeart,
  FiTrash2,
  FiSend,
  FiLoader,
} from "react-icons/fi";

interface Post {
  _id: string;
  userId: number;
  userName: string;
  content: string;
  likes: number;
  likedBy: number[];
  createdAt: string;
}

interface PostsFeedProps {
  userId?: number; // If provided, show only this user's posts
}

export default function PostsFeed({ userId }: PostsFeedProps) {
  const router = useRouter();
  const [posts, setPosts] = useState<Post[]>([]);
  const [newPost, setNewPost] = useState("");
  const [isPosting, setIsPosting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserName, setCurrentUserName] = useState<string | null>(null);
  const [likedPosts, setLikedPosts] = useState<Set<string>>(new Set());

  useEffect(() => {
    const stored = localStorage.getItem("cfa_user_id");
    const storedName = localStorage.getItem("cfa_user_name");
    setCurrentUserId(stored);
    setCurrentUserName(storedName);

    loadPosts();
  }, [userId]);

  const loadPosts = async () => {
    try {
      setLoading(true);
      const url = userId
        ? `/api/posts?userId=${userId}`
        : `/api/posts`;

      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setPosts(data);

        // Determine which posts are liked by current user
        const stored = localStorage.getItem("cfa_user_id");
        if (stored) {
          const currentUserIdNum = parseInt(stored, 10);
          const liked = new Set(
            data
              .filter((post: Post) => post.likedBy.includes(currentUserIdNum))
              .map((post: Post) => post._id)
          );
          setLikedPosts(liked);
        }
      }
    } catch (err) {
      console.error("Failed to load posts:", err);
    } finally {
      setLoading(false);
    }
  };

  const handlePostSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!currentUserId || !currentUserName) {
      alert("Please log in to post");
      return;
    }

    if (!newPost.trim()) {
      alert("Post cannot be empty");
      return;
    }

    try {
      setIsPosting(true);
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: currentUserId,
          userName: currentUserName,
          content: newPost,
        }),
      });

      if (res.ok) {
        const createdPost = await res.json();
        setPosts((prev) => [createdPost, ...prev]);
        setNewPost("");
      } else {
        alert("Failed to post. Please try again.");
      }
    } catch (err) {
      console.error("Failed to post:", err);
      alert("Error posting. Please try again.");
    } finally {
      setIsPosting(false);
    }
  };

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

  return (
    <div className="space-y-6">
      {/* Post Composer */}
      {!userId && currentUserId && (
        <div className="bg-white rounded-xl shadow-sm p-6">
          <form onSubmit={handlePostSubmit} className="space-y-4">
            <textarea
              value={newPost}
              onChange={(e) => setNewPost(e.target.value)}
              placeholder="Share your thoughts about CFA prep..."
              maxLength={5000}
              rows={4}
              className="w-full p-4 border border-gray-200 rounded-lg focus:border-cfa-navy focus:ring-2 focus:ring-cfa-navy/10 outline-none transition-all resize-none"
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">
                {newPost.length}/5000
              </span>
              <button
                type="submit"
                disabled={isPosting || !newPost.trim()}
                className="flex items-center gap-2 px-6 py-2.5 bg-cfa-navy text-white rounded-lg hover:bg-cfa-navy-light disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
              >
                {isPosting ? (
                  <>
                    <FiLoader className="h-4 w-4 animate-spin" />
                    Posting...
                  </>
                ) : (
                  <>
                    <FiSend className="h-4 w-4" />
                    Post
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Posts List */}
      {loading ? (
        <div className="text-center py-8">
          <div className="inline-block">
            <FiLoader className="h-8 w-8 animate-spin text-cfa-navy" />
          </div>
          <p className="text-gray-600 mt-2">Loading posts...</p>
        </div>
      ) : posts.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm p-12 text-center">
          <FiMessageCircle className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">
            {userId ? "No posts yet" : "No posts to show. Be the first to post!"}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {posts.map((post) => (
            <div
              key={post._id}
              className="bg-white rounded-xl shadow-sm p-6 hover:shadow-md transition-shadow"
            >
              {/* Post Header */}
              <div className="flex items-start justify-between mb-4">
                <button
                  onClick={() => router.push(`/profile/${post.userId}`)}
                  className="hover:opacity-70 transition-opacity text-left"
                >
                  <h3 className="font-semibold text-cfa-navy hover:text-cfa-navy-light">
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
                </button>

                {parseInt(currentUserId || "0") === post.userId && (
                  <button
                    onClick={() => handleDeletePost(post._id)}
                    className="p-2 hover:bg-red-50 rounded-lg text-red-500 transition-colors"
                  >
                    <FiTrash2 className="h-4 w-4" />
                  </button>
                )}
              </div>

              {/* Post Content */}
              <p className="text-gray-700 mb-4 whitespace-pre-wrap leading-relaxed">
                {post.content}
              </p>

              {/* Like Button */}
              <button
                onClick={() => handleLike(post._id)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all ${
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
  );
}
