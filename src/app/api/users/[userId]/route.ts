import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { User } from "@/lib/models/User";
import { Exam } from "@/lib/models/Exam";
import { Question } from "@/lib/models/Question";
import type { TopicScore } from "@/lib/models/Exam";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    await connectDB();

    const { userId: userIdStr } = await params;
    const userId = parseInt(userIdStr, 10);

    const user = await User.findOne({ numericId: userId }).lean();

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Get exams and stats
    const [exams, totalQuestionsInDB] = await Promise.all([
      Exam.find({ userId }).lean(),
      Question.countDocuments(),
    ]);

    let totalExams = exams.length;
    let averageScore = 0;
    let totalQuestions = 0;
    let correctAnswers = 0;

    const topicStats: Record<string, { correct: number; total: number }> = {};

    exams.forEach((exam) => {
      totalQuestions += exam.totalQuestions;
      correctAnswers += exam.score;

      exam.topicBreakdown.forEach((topic: TopicScore) => {
        if (!topicStats[topic.topic]) {
          topicStats[topic.topic] = { correct: 0, total: 0 };
        }
        topicStats[topic.topic].correct += topic.correct;
        topicStats[topic.topic].total += topic.total;
      });
    });

    averageScore = exams.length > 0
      ? Math.round((correctAnswers / totalQuestions) * 100)
      : 0;

    // Convert topicStats to array and sort by total questions
    const topicBreakdown = Object.entries(topicStats)
      .map(([topic, stats]) => ({
        topic,
        correct: stats.correct,
        total: stats.total,
        percentage: Math.round((stats.correct / stats.total) * 100),
      }))
      .sort((a, b) => b.total - a.total);

    return NextResponse.json({
      user: {
        numericId: user.numericId,
        name: user.name,
        createdAt: user.createdAt,
      },
      stats: {
        totalExams,
        totalQuestions,
        correctAnswers,
        averageScore,
        topicBreakdown,
        totalQuestionsInDB,
      },
    });
  } catch (err) {
    console.error("Failed to fetch user profile:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
