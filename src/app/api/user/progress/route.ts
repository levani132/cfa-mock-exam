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
    const attempts = user.questionAttempts || new Map();
    const attemptedCount = attempts.size;

    // Min attempt count across all attempted questions determines current cycle
    // If not all questions attempted, min is 0
    const minAttempts = attemptedCount < totalQuestions
      ? 0
      : Math.min(...Array.from(attempts.values() as Iterable<number>));
    const completedCycles = minAttempts;

    // "answeredCount" = how many questions have been answered more than minAttempts times
    // This gives the progress within the current cycle
    let answeredInCurrentCycle = 0;
    for (const count of attempts.values()) {
      if (count > minAttempts) {
        answeredInCurrentCycle++;
      }
    }
    // If all questions have been attempted at least once but not all have minAttempts+1,
    // then answeredInCurrentCycle = those with count > minAttempts
    // If some haven't been attempted at all, answeredInCurrentCycle = attemptedCount (those with count > 0)
    if (attemptedCount < totalQuestions) {
      answeredInCurrentCycle = attemptedCount;
    }

    const includeIds = req.nextUrl.searchParams.get("includeIds") === "true";

    return NextResponse.json({
      answeredCount: answeredInCurrentCycle,
      totalQuestions,
      completedCycles,
      ...(includeIds ? { questionAttempts: Object.fromEntries(attempts) } : {}),
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

    // Increment attempt count for each question
    if (!user.questionAttempts) {
      user.questionAttempts = new Map();
    }
    for (const qId of questionIds) {
      const key = String(qId);
      const current = user.questionAttempts.get(key) || 0;
      user.questionAttempts.set(key, current + 1);
    }

    await user.save();

    const totalQuestions = await Question.countDocuments();
    const attempts = user.questionAttempts;
    const attemptedCount = attempts.size;
    const minAttempts = attemptedCount < totalQuestions
      ? 0
      : Math.min(...Array.from(attempts.values() as Iterable<number>));
    const completedCycles = minAttempts;

    let answeredInCurrentCycle = 0;
    if (attemptedCount < totalQuestions) {
      answeredInCurrentCycle = attemptedCount;
    } else {
      for (const count of attempts.values()) {
        if (count > minAttempts) {
          answeredInCurrentCycle++;
        }
      }
    }

    return NextResponse.json({
      answeredCount: answeredInCurrentCycle,
      totalQuestions,
      completedCycles,
    });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
