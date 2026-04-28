import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Post } from "@/lib/models/Post";

// POST /api/posts/[postId]/comments — add a comment
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
) {
  try {
    const { postId } = await params;
    const body = await request.json();
    const { userId, userName, content } = body;

    if (!userId || !userName || !content?.trim()) {
      return NextResponse.json(
        { error: "userId, userName, and content are required" },
        { status: 400 }
      );
    }

    if (content.length > 2000) {
      return NextResponse.json({ error: "Comment too long (max 2000 chars)" }, { status: 400 });
    }

    await connectDB();

    const post = await Post.findById(postId);
    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    post.comments.push({
      userId: parseInt(String(userId), 10),
      userName: String(userName),
      content: String(content).trim(),
    } as never);

    await post.save();

    const newComment = post.comments[post.comments.length - 1];
    return NextResponse.json(newComment, { status: 201 });
  } catch (err) {
    console.error("Error adding comment:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
