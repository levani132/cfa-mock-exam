/**
 * Migration script: Convert answeredQuestions[] + completedCycles
 * into questionAttempts Map<string, number>.
 *
 * Logic:
 * - Each question in answeredQuestions gets count = completedCycles + 1
 *   (they were answered in the current cycle plus all completed cycles)
 * - Questions NOT in answeredQuestions but that existed during completed cycles
 *   get count = completedCycles (answered in previous cycles, reset cleared them)
 *
 * This is a non-destructive migration - it only sets questionAttempts if not already populated.
 * The old fields (answeredQuestions, completedCycles) are preserved.
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

const MONGODB_URI = process.env.MONGODB_URI!;

async function migrate() {
  console.log("Connecting to MongoDB...");
  await mongoose.connect(MONGODB_URI);
  console.log("Connected.");

  const db = mongoose.connection.db!;
  const usersCollection = db.collection("users");
  const questionsCollection = db.collection("questions");

  // Get all question IDs (needed to backfill completed cycles)
  const allQuestionIds = await questionsCollection
    .find({}, { projection: { _id: 1 } })
    .toArray();
  const allIds = allQuestionIds.map((q) => q._id.toString());
  console.log(`Total questions in DB: ${allIds.length}`);

  const users = await usersCollection.find({}).toArray();
  console.log(`Found ${users.length} users to migrate.`);

  let migrated = 0;
  let skipped = 0;

  for (const user of users) {
    // Skip if already migrated (has questionAttempts with data)
    if (user.questionAttempts && Object.keys(user.questionAttempts).length > 0) {
      console.log(`  User ${user.numericId} (${user.name}): already migrated, skipping.`);
      skipped++;
      continue;
    }

    const answeredQuestions: string[] = user.answeredQuestions || [];
    const completedCycles: number = user.completedCycles || 0;

    const questionAttempts: Record<string, number> = {};

    if (completedCycles > 0) {
      // All questions were answered `completedCycles` times (the full cycles)
      for (const qId of allIds) {
        questionAttempts[qId] = completedCycles;
      }
    }

    // Questions in the current answeredQuestions array get +1
    for (const qId of answeredQuestions) {
      questionAttempts[qId] = (questionAttempts[qId] || 0) + 1;
    }

    await usersCollection.updateOne(
      { _id: user._id },
      { $set: { questionAttempts } }
    );

    console.log(
      `  User ${user.numericId} (${user.name}): migrated. ` +
      `${completedCycles} cycles + ${answeredQuestions.length} current = ` +
      `${Object.keys(questionAttempts).length} entries in questionAttempts.`
    );
    migrated++;
  }

  console.log(`\nDone. Migrated: ${migrated}, Skipped: ${skipped}`);
  await mongoose.disconnect();
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
