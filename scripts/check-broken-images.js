const mongoose = require("mongoose");
const fs = require("fs");
const uri = fs.readFileSync(".env.local", "utf8").match(/MONGODB_URI=(.*)/)?.[1];

(async () => {
  await mongoose.connect(uri);
  const Q = mongoose.connection.collection("questions");

  // Get the 81 suspicious questions with images  
  // Pattern: text has "the following" followed by ":" and text is short
  const suspicious = await Q.find({
    images: { $exists: true, $not: { $size: 0 } },
    $expr: { $lte: [{ $strLenCP: "$text" }, 400] },
    text: { $regex: "the following|shown below|presented below|given below|as follows", $options: "i" },
  }).project({ _id: 1, text: 1, images: 1, source: 1, topic: 1 }).toArray();

  console.log(`Found ${suspicious.length} suspicious short questions with images\n`);

  let hasQuestionImages = 0;
  let onlyExplanationImages = 0;
  const byTopic = {};

  for (const q of suspicious) {
    const qImgs = (q.images || []).filter(i => i.location === "question");
    const eImgs = (q.images || []).filter(i => i.location === "explanation");
    
    if (qImgs.length > 0) {
      hasQuestionImages++;
    } else {
      onlyExplanationImages++;
      const t = q.topic || "Unknown";
      if (!byTopic[t]) byTopic[t] = [];
      byTopic[t].push({
        id: q._id.toString(),
        textLen: q.text?.length || 0,
        explanationImgs: eImgs.length,
        text: q.text?.substring(0, 100)
      });
    }
  }

  console.log(`With location=question images: ${hasQuestionImages}`);
  console.log(`Only location=explanation images: ${onlyExplanationImages}`);
  console.log("\nBroken questions by topic (no question images):");
  for (const [topic, qs] of Object.entries(byTopic)) {
    console.log(`\n  ${topic}: ${qs.length} questions`);
    for (const q of qs.slice(0, 3)) {
      console.log(`    ${q.id} (${q.textLen} chars, ${q.explanationImgs} expl imgs): ${q.text}...`);
    }
  }

  // Check what the explanation images look like for one specific question
  const sample = await Q.findOne({ _id: new mongoose.Types.ObjectId("69e971f32c62160058d2aa7c") });
  console.log("\n\nSample broken question (69e971f32c62160058d2aa7c):");
  console.log("Text:", sample.text.substring(0, 200));
  console.log("Total images:", sample.images?.length || 0);
  for (let i = 0; i < (sample.images?.length || 0); i++) {
    const img = sample.images[i];
    const dataLen = typeof img.data === "string" ? img.data.length : 0;
    // base64 length / 4 * 3 ≈ bytes
    const approxBytes = Math.round(dataLen * 0.75);
    console.log(`  Image ${i}: location=${img.location}, ~${Math.round(approxBytes/1024)}KB`);
  }

  await mongoose.disconnect();
})();
