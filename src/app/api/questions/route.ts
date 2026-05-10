import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import { Question, TOPIC_WEIGHTS, type Topic } from "@/lib/models/Question";
import { MockExam } from "@/lib/models/MockExam";
import { User } from "@/lib/models/User";

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
      const questions = await Question.find({ _id: { $in: mock.questionIds } }).lean();
      // $in doesn't guarantee result order, so re-sort by mock.questionIds.
      // Otherwise the two-session split could land on the wrong boundary if
      // MongoDB ever returns docs in a different order than insertion.
      type LeanQ = (typeof questions)[number];
      const byId = new Map<string, LeanQ>(questions.map((q: LeanQ) => [String(q._id), q]));
      const ordered: LeanQ[] = mock.questionIds
        .map((id: mongoose.Types.ObjectId) => byId.get(String(id)))
        .filter((q: LeanQ | undefined): q is LeanQ => Boolean(q));
      return NextResponse.json({
        questions: ordered.map((q) => ({
          _id: q._id,
          text: q.text,
          optionA: q.optionA,
          optionB: q.optionB,
          optionC: q.optionC,
          correctAnswer: q.correctAnswer,
          topic: q.topic,
          explanation: q.explanation,
          images: q.images,
          source: q.source,
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

    // Load question attempts from user profile if userId provided
    const userIdParam = req.nextUrl.searchParams.get("userId");
    let attemptsMap: Record<string, number> = {};
    if (userIdParam) {
      const user = await User.findOne({ numericId: parseInt(userIdParam, 10) });
      if (user?.questionAttempts) {
        attemptsMap = Object.fromEntries(user.questionAttempts);
      }
    }

    // Legacy: parse exclude list (kept for backward compat)
    const excludeParam = req.nextUrl.searchParams.get("exclude");
    const excludeObjectIds: mongoose.Types.ObjectId[] = [];
    if (excludeParam && Object.keys(attemptsMap).length === 0) {
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

    // Fetch questions for each topic, prioritizing least-attempted ones
    const allQuestions: Array<Record<string, unknown>> = [];
    const hasAttempts = Object.keys(attemptsMap).length > 0;

    for (const { topic, count } of topicCounts) {
      if (count <= 0) continue;

      if (hasAttempts) {
        // Get IDs with their attempt counts for this topic
        const topicAttemptIds = Object.entries(attemptsMap)
          .filter(([id]) => mongoose.Types.ObjectId.isValid(id))
          .map(([id, cnt]) => ({ id: new mongoose.Types.ObjectId(id), count: cnt }));

        // Find the minimum attempt count across all tracked questions
        const minCount = topicAttemptIds.length > 0
          ? Math.min(...topicAttemptIds.map((a) => a.count))
          : 0;

        // First try: get questions never attempted or with minimum attempts
        const leastAttemptedIds = topicAttemptIds
          .filter((a) => a.count <= minCount)
          .map((a) => a.id);

        // Strategy: fetch unattempted questions first, then least-attempted
        const matchFilter: Record<string, unknown> = { topic };
        const attemptedIds = topicAttemptIds.map((a) => a.id);

        // Phase 1: Questions never attempted for this topic
        const unattempted = await Question.aggregate([
          { $match: { ...matchFilter, _id: { $nin: attemptedIds } } },
          { $sample: { size: count } },
        ]);

        if (unattempted.length >= count) {
          allQuestions.push(...unattempted.slice(0, count));
        } else {
          allQuestions.push(...unattempted);
          const remaining = count - unattempted.length;

          // Phase 2: Least-attempted questions (those at minCount)
          if (remaining > 0 && leastAttemptedIds.length > 0) {
            const leastAttempted = await Question.aggregate([
              { $match: { ...matchFilter, _id: { $in: leastAttemptedIds } } },
              { $sample: { size: remaining } },
            ]);
            allQuestions.push(...leastAttempted);

            // Phase 3: If still need more, get next tier
            const stillRemaining = remaining - leastAttempted.length;
            if (stillRemaining > 0) {
              const usedIds = [
                ...unattempted.map((q: Record<string, unknown>) => q._id),
                ...leastAttempted.map((q: Record<string, unknown>) => q._id),
              ];
              const moreQuestions = await Question.aggregate([
                { $match: { ...matchFilter, _id: { $nin: usedIds } } },
                { $sample: { size: stillRemaining } },
              ]);
              allQuestions.push(...moreQuestions);
            }
          } else if (remaining > 0) {
            // All questions have been attempted, just sample randomly
            const usedIds = unattempted.map((q: Record<string, unknown>) => q._id);
            const moreQuestions = await Question.aggregate([
              { $match: { ...matchFilter, ...(usedIds.length > 0 ? { _id: { $nin: usedIds } } : {}) } },
              { $sample: { size: remaining } },
            ]);
            allQuestions.push(...moreQuestions);
          }
        }
      } else {
        // Legacy path: simple exclude
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
        source: q.source,
      })),
      topicDistribution: topicCounts,
    });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
