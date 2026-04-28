"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  FiMessageCircle,
  FiHeart,
  FiTrash2,
  FiSend,
  FiLoader,
  FiChevronDown,
  FiChevronUp,
} from "react-icons/fi";

interface Comment {
  _id: string;
  userId: number;
  userName: string;
  content: string;
  createdAt: string;
}

interface Post {
  _id: string;
  userId: number;
  userName: string;
  content: string;
  likes: number;
  likedBy: number[];
  comments: Comment[];
  createdAt: string;
}

interface PostsFeedProps {
  userId?: number;
}

export default function PostsFeed({ userId }: PostsFeedProps) {
  const router = useRouter();
  const [posts, setPosts] = useState<Post[]>([]);
  const [newPost, setNewPost] = useState("");
  const [isPosting, setIsPosting] = useState(false);
  const [loading, setLoading] = useState(true);
  const currentUserId = useMemo(
    () => (typeof window !== "undefined" ? localStorage.getItem("cfa_user_id") : null),
    []
  );
  const currentUserName = useMemo(
    () => (typeof window !== "undefined" ? localStorage.getItem("cfa_user_name") : null),
    []
  );
  const [likedPosts, setLikedPosts] = useState<Set<string>>(new Set());
  // Track which posts have comments expanded
  const [expandedComments, setExpandedComments] = useState<Set<string>>(new Set());
  // Per-post comment input
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});
  const [submittingComment, setSubmittingComment] = useState<string | null>(null);

  const loadPosts = useCallback(() => {
    const url = userId ? `/api/posts?userId=${userId}` : `/api/posts`;
    fetch(url)
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then((data: Post[]) => {
        setPosts(data);
        const stored = localStorage.getItem("cfa_user_id");
        if (stored) {
          const uid = parseInt(stored, 10);
          setLikedPosts(
            new Set<string>(data.filter((p) => p.likedBy.includes(uid)).map((p) => p._id))
          );
        }
      })
      .catch((err) => console.error("Failed to load posts:", err))
      .finally(() => setLoading(false));
  }, [userId]);

  useEffect(() => {
    loadPosts();
  }, [loadPosts]);

  const handlePostSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUserId || !currentUserName) { alert("Please log in to post"); return; }
    if (!newPost.trim()) { alert("Post cannot be empty"); return; }

    try {
      setIsPosting(true);
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: currentUserId, userName: currentUserName, content: newPost }),
      });
      if (res.ok) {
        const createdPost = await res.json();
        setPosts((prev) => [createdPost, ...prev]);
        setNewPost("");
      } else { alert("Failed to post. Please try again."); }
    } catch (err) {
      console.error("Failed to post:", err);
      alert("Error posting. Please try again.");
    } finally { setIsPosting(false); }
  };

  const handleLike = async (postId: string) => {
    if (!currentUserId) { alert("Please log in to like posts"); return; }
    const isLiked = likedPosts.has(postId);
    try {
      const res = await fetch(`/api/posts/${postId}/like`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: currentUserId, action: isLiked ? "unlike" : "like" }),
      });
      if (res.ok) {
        const updatedPost = await res.json();
        setPosts((prev) => prev.map((p) => (p._id === postId ? updatedPost : p)));
        setLikedPosts((prev) => {
          const next = new Set(prev);
          if (isLiked) { next.delete(postId); } else { next.add(postId); }
          return next;
        });
      }
    } catch (err) { console.error("Failed to like post:", err); }
  };

  const handleDeletePost = async (postId: string) => {
    if (!confirm("Delete this post?")) return;
    try {
      const res = await fetch(`/api/posts/${postId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: currentUserId }),
      });
      if (res.ok) { setPosts((prev) => prev.filter((p) => p._id !== postId)); }
      else { alert("Failed to delete post"); }
    } catch (err) { console.error("Failed to delete post:", err); }
  };

  const toggleComments = (postId: string) => {
    setExpandedComments((prev) => {
      const next = new Set(prev);
      if (next.has(postId)) { next.delete(postId); } else { next.add(postId); }
      return next;
    });
  };

  const handleAddComment = async (postId: string) => {
    const content = commentInputs[postId]?.trim();
    if (!content) return;
    if (!currentUserId || !currentUserName) { alert("Please log in to comment"); return; }

    setSubmittingComment(postId);
    try {
      const res = await fetch(`/api/posts/${postId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: currentUserId, userName: currentUserName, content }),
      });
      if (res.ok) {
        const newComment = await res.json();
        setPosts((prev) =>
          prev.map((p) =>
            p._id === postId ? { ...p, comments: [...(p.comments ?? []), newComment] } : p
          )
        );
        setCommentInputs((prev) => ({ ...prev, [postId]: "" }));
        // Ensure comments are expanded after posting
        setExpandedComments((prev) => new Set(prev).add(postId));
      } else { alert("Failed to add comment"); }
    } catch (err) { console.error("Failed to add comment:", err); }
    finally { setSubmittingComment(null); }
  };

  const handleDeleteComment = async (postId: string, commentId: string) => {
    if (!confirm("Delete this comment?")) return;
    try {
      const res = await fetch(`/api/posts/${postId}/comments/${commentId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: currentUserId }),
      });
      if (res.ok) {
        setPosts((prev) =>
          prev.map((p) =>
            p._id === postId
              ? { ...p, comments: p.comments.filter((c) => c._id !== commentId) }
              : p
          )
        );
      } else { alert("Failed to delete comment"); }
    } catch (err) { console.error("Failed to delete comment:", err); }
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
              <span className="text-xs text-gray-500">{newPost.length}/5000</span>
              <button
                type="submit"
                disabled={isPosting || !newPost.trim()}
                className="flex items-center gap-2 px-6 py-2.5 bg-cfa-navy text-white rounded-lg hover:bg-cfa-navy-light disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
              >
                {isPosting ? <><FiLoader className="h-4 w-4 animate-spin" />Posting...</> : <><FiSend className="h-4 w-4" />Post</>}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Posts List */}
      {loading ? (
        <div className="text-center py-8">
          <FiLoader className="h-8 w-8 animate-spin text-cfa-navy mx-auto" />
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
          {posts.map((post) => {
            const commentsExpanded = expandedComments.has(post._id);
            const commentCount = post.comments?.length ?? 0;

            return (
              <div key={post._id} className="bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow">
                <div className="p-6">
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
                          month: "short", day: "numeric", year: "numeric",
                          hour: "2-digit", minute: "2-digit",
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

                  {/* Action Bar */}
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => handleLike(post._id)}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all ${
                        likedPosts.has(post._id)
                          ? "bg-red-50 text-red-500"
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      }`}
                    >
                      <FiHeart className={`h-4 w-4 ${likedPosts.has(post._id) ? "fill-current" : ""}`} />
                      <span className="text-sm font-medium">{post.likes}</span>
                    </button>

                    <button
                      onClick={() => toggleComments(post._id)}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition-all"
                    >
                      <FiMessageCircle className="h-4 w-4" />
                      <span className="text-sm font-medium">{commentCount}</span>
                      {commentsExpanded
                        ? <FiChevronUp className="h-3.5 w-3.5" />
                        : <FiChevronDown className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>

                {/* Comments Section */}
                {commentsExpanded && (
                  <div className="border-t border-gray-100 px-6 pb-6 pt-4 space-y-4">
                    {/* Existing Comments */}
                    {commentCount === 0 ? (
                      <p className="text-sm text-gray-400 text-center py-2">No comments yet. Be the first!</p>
                    ) : (
                      <div className="space-y-3">
                        {post.comments.map((comment) => (
                          <div key={comment._id} className="flex gap-3 group">
                            <div className="flex-1 bg-gray-50 rounded-lg px-4 py-3">
                              <div className="flex items-center justify-between mb-1">
                                <button
                                  onClick={() => router.push(`/profile/${comment.userId}`)}
                                  className="text-sm font-medium text-cfa-navy hover:opacity-70 transition-opacity"
                                >
                                  {comment.userName}
                                </button>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-gray-400">
                                    {new Date(comment.createdAt).toLocaleDateString("en-US", {
                                      month: "short", day: "numeric",
                                      hour: "2-digit", minute: "2-digit",
                                    })}
                                  </span>
                                  {parseInt(currentUserId || "0") === comment.userId && (
                                    <button
                                      onClick={() => handleDeleteComment(post._id, comment._id)}
                                      className="text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-all"
                                    >
                                      <FiTrash2 className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                </div>
                              </div>
                              <p className="text-sm text-gray-700 whitespace-pre-wrap">{comment.content}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Add Comment Input */}
                    {currentUserId ? (
                      <div className="flex gap-2 pt-1">
                        <input
                          type="text"
                          value={commentInputs[post._id] ?? ""}
                          onChange={(e) =>
                            setCommentInputs((prev) => ({ ...prev, [post._id]: e.target.value }))
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                              e.preventDefault();
                              handleAddComment(post._id);
                            }
                          }}
                          placeholder="Write a comment..."
                          maxLength={2000}
                          className="flex-1 px-4 py-2 text-sm border border-gray-200 rounded-lg focus:border-cfa-navy focus:ring-2 focus:ring-cfa-navy/10 outline-none transition-all"
                        />
                        <button
                          onClick={() => handleAddComment(post._id)}
                          disabled={!commentInputs[post._id]?.trim() || submittingComment === post._id}
                          className="px-4 py-2 bg-cfa-navy text-white rounded-lg hover:bg-cfa-navy-light disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                          {submittingComment === post._id
                            ? <FiLoader className="h-4 w-4 animate-spin" />
                            : <FiSend className="h-4 w-4" />}
                        </button>
                      </div>
                    ) : (
                      <p className="text-sm text-gray-400 text-center">
                        <button onClick={() => router.push("/login")} className="text-cfa-navy hover:underline">Log in</button> to comment
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
