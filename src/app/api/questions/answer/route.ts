import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Question } from "@/lib/models/Question";

export async function PATCH(req: NextRequest) {
  try {
    const { questionId, correctAnswer } = await req.json();

    if (!questionId || !["A", "B", "C"].includes(correctAnswer)) {
      return NextResponse.json(
        { error: "Invalid questionId or correctAnswer (must be A, B, or C)" },
        { status: 400 }
      );
    }

    await connectDB();

    const updated = await Question.findByIdAndUpdate(
      questionId,
      { correctAnswer },
      { new: true }
    );

    if (!updated) {
      return NextResponse.json({ error: "Question not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, correctAnswer: updated.correctAnswer });
  } catch {
    return NextResponse.json({ error: "Failed to update question" }, { status: 500 });
  }
}
