/**
 * Migration script: fix ligature null bytes in all DB question fields.
 *
 * Usage: npx tsx scripts/fix-ligatures-db.ts [--dry-run]
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
import { fixLigatures, questionHash } from "../src/lib/pdf-parser";

dotenv.config({ path: ".env.local" });

const MONGODB_URI = process.env.MONGODB_URI!;
if (!MONGODB_URI) {
  console.error("MONGODB_URI not set in .env.local");
  process.exit(1);
}

const questionSchema = new mongoose.Schema({
  text: String,
  optionA: String,
  optionB: String,
  optionC: String,
  correctAnswer: String,
  explanation: String,
  source: String,
  topic: String,
  textHash: { type: String, unique: true },
  createdAt: Date,
});

const Question = mongoose.model("Question", questionSchema);

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  if (dryRun) console.log("=== DRY RUN — no DB changes ===\n");

  await mongoose.connect(MONGODB_URI);
  console.log("Connected to MongoDB\n");

  const NULL_RE = /\u0000/;
  const fields = ["text", "optionA", "optionB", "optionC", "explanation"] as const;

  // MongoDB can't regex on null bytes, so fetch all and filter in JS
  const allQuestions = await Question.find({});
  const NULL_BYTE = "\u0000";
  const affected = allQuestions.filter((doc) =>
    fields.some((f) => {
      const val = (doc as unknown as Record<string, unknown>)[f] as string | undefined;
      return val && val.includes(NULL_BYTE);
    })
  );

  console.log(`Found ${affected.length} questions with null bytes\n`);
  if (affected.length === 0) {
    console.log("Nothing to fix!");
    await mongoose.disconnect();
    return;
  }

  let fixedCount = 0;
  let errorCount = 0;

  for (const doc of affected) {
    const updates: Record<string, string> = {};
    let changed = false;

    for (const field of fields) {
      const val = (doc as unknown as Record<string, unknown>)[field] as string | undefined;
      if (val && NULL_RE.test(val)) {
        const fixed = fixLigatures(val);
        if (fixed !== val) {
          updates[field] = fixed;
          changed = true;
        }
      }
    }

    if (changed) {
      // Recompute textHash with fixed text
      const newText = updates.text ?? (doc.text as string);
      const newA = updates.optionA ?? (doc.optionA as string);
      const newB = updates.optionB ?? (doc.optionB as string);
      const newC = updates.optionC ?? (doc.optionC as string);
      updates.textHash = questionHash(newText, newA, newB, newC);

      if (dryRun) {
        // Show a sample of fixes
        if (fixedCount < 5) {
          console.log(`--- Question ${doc._id} ---`);
          for (const [field, newVal] of Object.entries(updates)) {
            if (field === "textHash") continue;
            const oldVal = (doc as unknown as Record<string, unknown>)[field] as string;
            // Show first difference
            for (let i = 0; i < oldVal.length; i++) {
              if (oldVal[i] !== newVal[i]) {
                const start = Math.max(0, i - 20);
                const end = Math.min(oldVal.length, i + 30);
                console.log(`  ${field}:`);
                console.log(`    old: ...${oldVal.substring(start, end).replace(/\u0000/g, "□")}...`);
                console.log(`    new: ...${newVal.substring(start, end)}...`);
                break;
              }
            }
          }
          console.log();
        }
        fixedCount++;
      } else {
        try {
          await Question.updateOne({ _id: doc._id }, { $set: updates });
          fixedCount++;
        } catch (err: unknown) {
          // Duplicate textHash means a duplicate question after fixing
          if (err instanceof Error && err.message.includes("duplicate key")) {
            console.warn(`  Duplicate after fix — deleting ${doc._id}`);
            await Question.deleteOne({ _id: doc._id });
          } else {
            console.error(`  Error updating ${doc._id}:`, err);
            errorCount++;
          }
        }
      }
    }
  }

  console.log(`\n${dryRun ? "Would fix" : "Fixed"}: ${fixedCount} questions`);
  if (errorCount > 0) console.log(`Errors: ${errorCount}`);

  // Verify no remaining null bytes
  if (!dryRun) {
    const remainingDocs = await Question.find({});
    const remaining = remainingDocs.filter((doc) =>
      fields.some((f) => {
        const val = (doc as unknown as Record<string, unknown>)[f] as string | undefined;
        return val && val.includes("\u0000");
      })
    ).length;
    console.log(`Remaining questions with null bytes: ${remaining}`);
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
