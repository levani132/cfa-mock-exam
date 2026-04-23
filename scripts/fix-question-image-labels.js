#!/usr/bin/env node
/**
 * Fix broken questions that reference "the following" data/table/diagram but
 * have NO location="question" images. 
 *
 * Root cause: When images were extracted from answer PDFs, ALL images got
 * location="explanation". But the answer PDF structure is: question text →
 * table/diagram image → explanation text → explanation images. So the FIRST
 * image in the explanation set is often actually the question's data table.
 *
 * This script:
 * 1. Finds questions with text patterns indicating missing inline data
 * 2. That have no location="question" images but DO have explanation images
 * 3. Re-labels the FIRST explanation image as location="question"
 *
 * Only targets questions from answer PDFs (UWorld) where the table was an image.
 */

const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");

const DRY_RUN = process.argv.includes("--dry-run");

const envContent = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
const uri = envContent.match(/MONGODB_URI=(.*)/)?.[1];

// Patterns that indicate "the following data/table" is referenced but missing
const BROKEN_PATTERNS = [
  /the following[\s\w\-]*(?:information|data|table|details|characteristics|diagram|figure|exhibit|schedule|multiples|deposits|amounts|ratios|summary|results|statistics|facts|items|measures|metrics|rates|costs|values|prices|balance sheet|income statement|cash flow|financial)[\s\w\-]*:/i,
  /as follows\s*:/i,
  /shown below\s*:/i,
  /presented below\s*:/i,
  /given below\s*:/i,
  /following (?:diagram|table|figure|exhibit|chart|graph|data)\s/i,
  /the following[\s\w\-]*:\s*$/im, // ends line with colon after "the following"
];

// Patterns that are FALSE POSITIVES - "Which of the following" etc.
const FALSE_POSITIVE_PATTERNS = [
  /which of the following/i,
  /all of the following/i,
  /each of the following/i,
  /none of the following/i,
];

function isBrokenQuestion(text) {
  // Must match at least one broken pattern
  const matchesBroken = BROKEN_PATTERNS.some(p => p.test(text));
  if (!matchesBroken) return false;
  
  // But not be a false positive like "Which of the following is..."
  // unless the text ALSO has a data-reference pattern
  const textBeforeQuestion = text.split(/\?/)[0]; // text before the question mark
  const hasFalsePositive = FALSE_POSITIVE_PATTERNS.some(p => p.test(text));
  
  // If it's ONLY a "which of the following" with no data reference, skip
  if (hasFalsePositive) {
    // Check if there's also a data reference (table/info intro followed by colon)
    const hasDataRef = /(?:information|data|table|diagram|figure|exhibit|chart|characteristics|deposits|amounts|multiples)[\s\w]*:/i.test(text);
    if (!hasDataRef) return false;
  }
  
  return true;
}

(async () => {
  await mongoose.connect(uri);
  const Q = mongoose.connection.collection("questions");

  // Find all questions with explanation images but no question images
  const candidates = await Q.find({
    images: { $exists: true, $not: { $size: 0 } },
  }).project({ _id: 1, text: 1, images: 1, topic: 1, source: 1 }).toArray();

  let fixed = 0;
  let skipped = 0;
  let falsePositives = 0;
  const fixedByTopic = {};

  for (const q of candidates) {
    const qImgs = (q.images || []).filter(i => i.location === "question");
    const eImgs = (q.images || []).filter(i => i.location === "explanation");
    
    // Skip if already has question images or no explanation images
    if (qImgs.length > 0 || eImgs.length === 0) {
      skipped++;
      continue;
    }

    const text = q.text || "";
    
    // Check if this looks like a broken question
    if (!isBrokenQuestion(text)) {
      continue;
    }

    // This question references data/table but has no question images
    // Re-label the FIRST explanation image as a question image
    const topic = q.topic || "Unknown";
    if (!fixedByTopic[topic]) fixedByTopic[topic] = 0;
    fixedByTopic[topic]++;

    if (!DRY_RUN) {
      // MongoDB: set the location of the first explanation image to "question"
      // Find the index of the first explanation image
      const firstExplIdx = q.images.findIndex(i => i.location === "explanation");
      if (firstExplIdx >= 0) {
        await Q.updateOne(
          { _id: q._id },
          { $set: { [`images.${firstExplIdx}.location`]: "question" } }
        );
      }
    }

    fixed++;
    if (fixed <= 10) {
      console.log(`  ${q._id} [${topic}]: "${text.substring(0, 80)}..." (${eImgs.length} expl imgs)`);
    }
  }

  console.log(`\n✅ ${DRY_RUN ? "DRY RUN " : ""}Done!`);
  console.log(`   Questions fixed: ${fixed}`);
  console.log(`   Already had question images: ${skipped}`);
  console.log(`\n   By topic:`);
  for (const [topic, count] of Object.entries(fixedByTopic).sort((a, b) => b[1] - a[1])) {
    console.log(`     ${topic}: ${count}`);
  }

  await mongoose.disconnect();
})();
