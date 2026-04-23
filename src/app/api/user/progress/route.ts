import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { User } from "@/lib/models/User";
import { Question } from "@/lib/models/Question";

export async function GET(req: NextRequest) {
  try {
    await connectDB();
    const userId = req.nextUrl.searchParams.get("userId");
    if (!userId) {
      return NextResponse.json({ error: "userId required" }, { status: 400 });
    }

    const user = await User.findOne({ numericId: parseInt(userId, 10) });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const totalQuestions = await Question.countDocuments();
    const includeIds = req.nextUrl.searchParams.get("includeIds") === "true";

    return NextResponse.json({
      answeredCount: user.answeredQuestions.length,
      totalQuestions,
      completedCycles: user.completedCycles,
      ...(includeIds ? { answeredIds: user.answeredQuestions } : {}),
    });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const { userId, questionIds } = await req.json();

    if (!userId || !Array.isArray(questionIds)) {
      return NextResponse.json({ error: "userId and questionIds required" }, { status: 400 });
    }

    const user = await User.findOne({ numericId: userId });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Add new question IDs (avoid duplicates)
    const existing = new Set(user.answeredQuestions.map(String));
    const newIds = questionIds.filter((id: string) => !existing.has(String(id)));
    
    if (newIds.length > 0) {
      user.answeredQuestions.push(...newIds);
    }

    // Check if user has gone through all questions
    const totalQuestions = await Question.countDocuments();
    if (user.answeredQuestions.length >= totalQuestions) {
      user.completedCycles += 1;
      user.answeredQuestions = [];
    }

    await user.save();

    return NextResponse.json({
      answeredCount: user.answeredQuestions.length,
      totalQuestions,
      completedCycles: user.completedCycles,
    });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
