import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { MockExam } from "@/lib/models/MockExam";

/** GET: List all available mock exams */
export async function GET() {
  try {
    await connectDB();
    const mocks = await MockExam.find({})
      .select("name source totalQuestions timeLimitMinutes")
      .sort({ name: 1 });

    return NextResponse.json({ mockExams: mocks });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/** POST: Create a new mock exam (admin only) */
export async function POST(req: NextRequest) {
  try {
    const password = req.headers.get("x-admin-password");
    if (password !== process.env.ADMIN_PASSWORD) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const { name, source, questionIds, timeLimitMinutes } = await req.json();

    if (!name || !questionIds?.length) {
      return NextResponse.json(
        { error: "name and questionIds are required" },
        { status: 400 }
      );
    }

    const mock = await MockExam.findOneAndUpdate(
      { name },
      {
        $setOnInsert: {
          name,
          source: source || name,
          questionIds,
          totalQuestions: questionIds.length,
          timeLimitMinutes: timeLimitMinutes || 270,
        },
      },
      { upsert: true, new: true }
    );

    return NextResponse.json({ mockExam: mock });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
