import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Post } from "@/lib/models/Post";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
) {
  try {
    await connectDB();
    const body = await req.json();
    const { userId } = body;
    const { postId } = await params;

    if (!userId) {
      return NextResponse.json(
        { error: "Missing userId" },
        { status: 400 }
      );
    }

    const post = await Post.findById(postId);
    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    // Only allow post owner to delete
    if (post.userId !== parseInt(userId, 10)) {
      return NextResponse.json(
        { error: "Not authorized" },
        { status: 403 }
      );
    }

    await Post.findByIdAndDelete(postId);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Failed to delete post:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
