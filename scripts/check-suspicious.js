const mongoose = require("mongoose");
const fs = require("fs");
const uri = fs.readFileSync(".env.local", "utf8").match(/MONGODB_URI=(.*)/)?.[1];

(async () => {
  await mongoose.connect(uri);
  const Q = mongoose.connection.collection("questions");

  // Search for both reported questions
  const searches = [
    { label: "Gordon growth + dividend growth rate", regex: /Gordon growth model.*dividend growth rate/i },
    { label: "gathered company stock (all)", regex: /gathered.*following.*company stock/i },
    { label: "manufacturing LIFO", regex: /manufacturing.*LIFO/i },
    { label: "LIFO balance sheet", regex: /LIFO.*balance sheet/i },
  ];

  for (const s of searches) {
    const results = await Q.find({ text: s.regex }).project({ _id: 1, text: 1, images: 1 }).toArray();
    console.log(`\n=== ${s.label}: ${results.length} results ===`);
    for (const q of results) {
      console.log(`  ID: ${q._id} | Len: ${q.text.length} | Imgs: ${q.images?.length || 0}`);
      console.log(`  Text: ${q.text.substring(0, 300)}`);
    }
  }

  // Broader detection: questions with "the following" + colon pattern but missing table data
  // These have images (table was in image in question PDF) but the text is still short/broken
  const all = await Q.find({}).project({ _id: 1, text: 1, images: 1 }).toArray();
  
  const suspicious = [];
  for (const q of all) {
    if (!q.text) continue;
    const t = q.text;
    // Pattern: "the following [info/data/information]:" then within short distance, another sentence ending with "closest to:" or similar
    const m = t.match(/the following[\s\S]{0,80}?:\s*\n/i);
    if (!m) continue;
    const afterColon = t.substring(m.index + m[0].length).trim();
    // If the content after the colon is very short (no table data between), it's suspicious
    // Even if it HAS images, the text is still broken for display
    if (afterColon.length < 200 && /closest to:|most likely|least likely|best described/i.test(afterColon)) {
      suspicious.push({
        id: q._id.toString(),
        len: t.length,
        imgs: q.images?.length || 0,
        text: t.substring(0, 200).replace(/\n/g, " ")
      });
    }
  }

  console.log(`\n=== ALL suspicious (short after colon): ${suspicious.length} ===`);
  for (const s of suspicious) {
    console.log(`  ${s.id} | Len:${s.len} | Imgs:${s.imgs} | ${s.text}`);
  }

  await mongoose.disconnect();
})();
