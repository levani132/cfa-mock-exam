import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Post } from "@/lib/models/Post";

export async function GET(req: NextRequest) {
  try {
    await connectDB();

    const userId = req.nextUrl.searchParams.get("userId");
    const limit = parseInt(req.nextUrl.searchParams.get("limit") || "50", 10);

    let query: any = {};
    if (userId) {
      query.userId = parseInt(userId, 10);
    }

    const posts = await Post.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    return NextResponse.json(posts);
  } catch (err) {
    console.error("Failed to fetch posts:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const body = await req.json();

    const { userId, userName, content } = body;

    if (!userId || !userName || !content || content.trim().length === 0) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const post = await Post.create({
      userId: parseInt(userId, 10),
      userName,
      content: content.trim(),
      likes: 0,
      likedBy: [],
    });

    return NextResponse.json(post, { status: 201 });
  } catch (err) {
    console.error("Failed to create post:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
