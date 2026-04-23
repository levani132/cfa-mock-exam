// Collect all unique broken word patterns (words containing null bytes)
const mongoose = require("mongoose");
const fs = require("fs");
const uri = fs.readFileSync(".env.local", "utf8").match(/MONGODB_URI=(.*)/)?.[1];

(async () => {
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  const questions = db.collection("questions");
  
  const all = await questions.find({}).project({ text: 1, optionA: 1, optionB: 1, optionC: 1, explanation: 1 }).toArray();
  
  // Extract all unique "broken words" (words containing \u0000)
  const brokenWords = new Map(); // word -> count
  
  for (const q of all) {
    for (const field of ["text", "optionA", "optionB", "optionC", "explanation"]) {
      const val = q[field] || "";
      // Split into words and find those with null bytes
      const words = val.split(/[\s\n]+/);
      for (const word of words) {
        if (word.includes("\u0000")) {
          // Normalize: strip punctuation from edges
          const clean = word.replace(/^[^a-zA-Z\u0000]+|[^a-zA-Z\u0000]+$/g, "");
          if (clean) {
            brokenWords.set(clean, (brokenWords.get(clean) || 0) + 1);
          }
        }
      }
    }
  }
  
  console.log("Unique broken words:", brokenWords.size);
  
  // Sort by frequency
  const sorted = [...brokenWords.entries()].sort((a, b) => b[1] - a[1]);
  
  // For each, show possible replacements
  const ligatures = { fi: "fi", fl: "fl", ff: "ff", ffi: "ffi", ffl: "ffl" };
  
  for (const [word, count] of sorted) {
    const options = {};
    for (const [name, replacement] of Object.entries(ligatures)) {
      options[name] = word.replace(/\u0000/g, replacement);
    }
    console.log(`${count}x: ${JSON.stringify(word)} → fi:${options.fi} fl:${options.fl} ff:${options.ff} ffi:${options.ffi} ffl:${options.ffl}`);
  }
  
  await mongoose.disconnect();
})();
