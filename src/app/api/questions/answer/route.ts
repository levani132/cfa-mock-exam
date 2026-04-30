import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Question } from "@/lib/models/Question";
import { Exam } from "@/lib/models/Exam";

// Recalculate all exams that contain this question
async function recalculateExams(questionId: string, newCorrectAnswer: string) {
  try {
    const exams = await Exam.find({ "answers.questionId": questionId });

    for (const exam of exams) {
      let changed = false;
      for (const answer of exam.answers) {
        if (answer.questionId === questionId) {
          const wasCorrect = answer.isCorrect;
          answer.correct = newCorrectAnswer as "A" | "B" | "C";
          answer.isCorrect = answer.selected === newCorrectAnswer;
          if (wasCorrect !== answer.isCorrect) changed = true;
        }
      }

      if (!changed) continue;

      // Recalculate score and percentage
      exam.score = exam.answers.filter((a: { isCorrect: boolean }) => a.isCorrect).length;
      exam.percentage = Math.round((exam.score / exam.totalQuestions) * 100);

      // Recalculate topic breakdown
      const topicMap: Record<string, { correct: number; total: number }> = {};
      for (const answer of exam.answers) {
        if (!topicMap[answer.topic]) {
          topicMap[answer.topic] = { correct: 0, total: 0 };
        }
        topicMap[answer.topic].total++;
        if (answer.isCorrect) topicMap[answer.topic].correct++;
      }
      exam.topicBreakdown = Object.entries(topicMap).map(([topic, stats]) => ({
        topic,
        correct: stats.correct,
        total: stats.total,
        percentage: Math.round((stats.correct / stats.total) * 100),
      }));

      await exam.save();
    }
  } catch (err) {
    console.error("Failed to recalculate exams after correctAnswer change:", err);
  }
}

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

    // Fire-and-forget: recalculate affected exams in the background
    recalculateExams(questionId, correctAnswer);

    return NextResponse.json({ success: true, correctAnswer: updated.correctAnswer });
  } catch {
    return NextResponse.json({ error: "Failed to update question" }, { status: 500 });
  }
}
