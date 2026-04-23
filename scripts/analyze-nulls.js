const mongoose = require("mongoose");
const fs = require("fs");
const uri = fs.readFileSync(".env.local", "utf8").match(/MONGODB_URI=(.*)/)?.[1];

(async () => {
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  const questions = db.collection("questions");
  
  const all = await questions.find({}).project({ text: 1, optionA: 1, optionB: 1, optionC: 1, explanation: 1, source: 1 }).toArray();
  
  let nullCount = 0;
  const contexts = [];
  const patternCounts = {};
  
  for (const q of all) {
    for (const field of ["text", "optionA", "optionB", "optionC", "explanation"]) {
      const val = q[field] || "";
      let idx = -1;
      while ((idx = val.indexOf("\u0000", idx + 1)) >= 0) {
        nullCount++;
        const start = Math.max(0, idx - 10);
        const end = Math.min(val.length, idx + 15);
        const context = val.substring(start, end).replace(/\u0000/g, "\u2588");
        if (contexts.length < 50) {
          contexts.push(`${field}: ...${context}...`);
        }
        // Analyze what character follows the null
        const after = val.substring(idx + 1, idx + 6);
        const before = val.substring(Math.max(0, idx - 3), idx);
        const pattern = `${before}\u2588${after.substring(0, 3)}`;
        patternCounts[pattern] = (patternCounts[pattern] || 0) + 1;
      }
    }
  }
  
  const questionsWithNulls = all.filter(q => 
    [q.text, q.optionA, q.optionB, q.optionC, q.explanation].some(v => v && v.includes("\u0000"))
  ).length;
  
  console.log("Total questions:", all.length);
  console.log("Questions with null bytes:", questionsWithNulls);
  console.log("Total null byte occurrences:", nullCount);
  console.log("\nSample contexts:");
  contexts.forEach(c => console.log("  " + c));
  
  console.log("\nTop patterns (before+after null):");
  Object.entries(patternCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .forEach(([pattern, count]) => console.log(`  ${count}x: "${pattern}"`));
  
  await mongoose.disconnect();
})();
