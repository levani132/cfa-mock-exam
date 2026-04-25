import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import { Question, TOPIC_WEIGHTS, type Topic } from "@/lib/models/Question";
import { MockExam } from "@/lib/models/MockExam";

export async function GET(req: NextRequest) {
  try {
    await connectDB();

    // Return question counts by topic
    if (req.nextUrl.searchParams.get("counts") !== null) {
      const counts = await Question.aggregate([
        { $group: { _id: "$topic", count: { $sum: 1 } } },
      ]);
      const byTopic: Record<string, number> = {};
      let total = 0;
      for (const c of counts) {
        byTopic[c._id] = c.count;
        total += c.count;
      }
      return NextResponse.json({ byTopic, total });
    }

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
          images: q.images,
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

    // Parse exclude list (already-answered question IDs)
    const excludeParam = req.nextUrl.searchParams.get("exclude");
    const excludeObjectIds: mongoose.Types.ObjectId[] = [];
    if (excludeParam) {
      for (const raw of excludeParam.split(",")) {
        const id = raw.trim();
        if (id && mongoose.Types.ObjectId.isValid(id)) {
          excludeObjectIds.push(new mongoose.Types.ObjectId(id));
        }
      }
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
          ? Math.max(0, totalCount - assigned)
          : Math.floor(proportion * totalCount);
      topicCounts.push({ topic, count });
      assigned += count;
    });

    // Fetch questions for each topic, excluding already-answered ones
    const allQuestions: Array<Record<string, unknown>> = [];
    for (const { topic, count } of topicCounts) {
      if (count <= 0) continue;
      const matchFilter: Record<string, unknown> = { topic };
      if (excludeObjectIds.length > 0) {
        matchFilter._id = { $nin: excludeObjectIds };
      }
      const questions = await Question.aggregate([
        { $match: matchFilter },
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
        images: q.images,
      })),
      topicDistribution: topicCounts,
    });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
