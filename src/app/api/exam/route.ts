import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Exam } from "@/lib/models/Exam";

export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const body = await req.json();

    const exam = await Exam.create({
      userId: body.userId,
      config: body.config,
      questionIds: body.questionIds,
      answers: body.answers,
      score: body.score,
      totalQuestions: body.totalQuestions,
      percentage: body.percentage,
      topicBreakdown: body.topicBreakdown,
      startedAt: body.startedAt || new Date(),
      completedAt: body.completedAt || new Date(),
      timeSpentSeconds: body.timeSpentSeconds,
    });

    return NextResponse.json({ examId: exam._id });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    await connectDB();
    const userId = req.nextUrl.searchParams.get("userId");
    const examId = req.nextUrl.searchParams.get("examId");

    if (examId) {
      const exam = await Exam.findById(examId);
      if (!exam) {
        return NextResponse.json({ error: "Exam not found" }, { status: 404 });
      }
      return NextResponse.json({ exam });
    }

    if (!userId) {
      return NextResponse.json({ error: "userId required" }, { status: 400 });
    }

    const exams = await Exam.find({ userId: parseInt(userId, 10) })
      .sort({ completedAt: -1 })
      .limit(50)
      .select("config score totalQuestions percentage startedAt completedAt timeSpentSeconds topicBreakdown");

    return NextResponse.json({ exams });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
