import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Question, TOPIC_WEIGHTS, type Topic } from "@/lib/models/Question";
import { MockExam } from "@/lib/models/MockExam";

export async function GET(req: NextRequest) {
  try {
    await connectDB();

    // Check for mock exam mode
    const mockExamId = req.nextUrl.searchParams.get("mockExamId");
    if (mockExamId) {
      const mock = await MockExam.findById(mockExamId);
      if (!mock) {
        return NextResponse.json({ error: "Mock exam not found" }, { status: 404 });
      }
      const questions = await Question.find({ _id: { $in: mock.questionIds } });
      return NextResponse.json({
        questions: questions.map((q) => ({
          _id: q._id,
          text: q.text,
          optionA: q.optionA,
          optionB: q.optionB,
          optionC: q.optionC,
          correctAnswer: q.correctAnswer,
          topic: q.topic,
          explanation: q.explanation,
        })),
        mockExamName: mock.name,
      });
    }

    const topicsParam = req.nextUrl.searchParams.get("topics");
    const countParam = req.nextUrl.searchParams.get("count");

    if (!topicsParam || !countParam) {
      return NextResponse.json({ error: "topics and count params required" }, { status: 400 });
    }

    const topics = topicsParam.split(",") as Topic[];
    const totalCount = parseInt(countParam, 10);

    if (isNaN(totalCount) || totalCount < 1) {
      return NextResponse.json({ error: "Valid count required" }, { status: 400 });
    }

    // Calculate proportional distribution
    const totalWeight = topics.reduce((sum, t) => sum + (TOPIC_WEIGHTS[t] || 0), 0);
    const topicCounts: { topic: Topic; count: number }[] = [];
    let assigned = 0;

    topics.forEach((topic, i) => {
      const weight = TOPIC_WEIGHTS[topic] || 0;
      const proportion = totalWeight > 0 ? weight / totalWeight : 1 / topics.length;
      const count =
        i === topics.length - 1
          ? totalCount - assigned
          : Math.round(proportion * totalCount);
      topicCounts.push({ topic, count });
      assigned += count;
    });

    // Fetch questions for each topic
    const allQuestions: Array<Record<string, unknown>> = [];
    for (const { topic, count } of topicCounts) {
      const questions = await Question.aggregate([
        { $match: { topic } },
        { $sample: { size: count } },
      ]);
      allQuestions.push(...questions);
    }

    // Shuffle
    for (let i = allQuestions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [allQuestions[i], allQuestions[j]] = [allQuestions[j], allQuestions[i]];
    }

    return NextResponse.json({
      questions: allQuestions.map((q) => ({
        _id: q._id,
        text: q.text,
        optionA: q.optionA,
        optionB: q.optionB,
        optionC: q.optionC,
        correctAnswer: q.correctAnswer,
        topic: q.topic,
        explanation: q.explanation,
      })),
      topicDistribution: topicCounts,
    });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
