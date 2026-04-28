import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Post } from "@/lib/models/Post";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
) {
  try {
    await connectDB();
    const body = await req.json();
    const { postId } = await params;

    const { userId, action } = body; // action: "like" or "unlike"

    if (!postId || !userId || !action) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const post = await Post.findById(postId);
    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    const userIdNum = parseInt(userId, 10);
    const likedIndex = post.likedBy.indexOf(userIdNum);

    if (action === "like" && likedIndex === -1) {
      post.likedBy.push(userIdNum);
      post.likes += 1;
    } else if (action === "unlike" && likedIndex !== -1) {
      post.likedBy.splice(likedIndex, 1);
      post.likes -= 1;
    }

    await post.save();
    return NextResponse.json(post);
  } catch (err) {
    console.error("Failed to update post likes:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
