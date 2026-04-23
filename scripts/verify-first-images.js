const mongoose = require("mongoose");
const fs = require("fs");
const uri = fs.readFileSync(".env.local", "utf8").match(/MONGODB_URI=(.*)/)?.[1];

(async () => {
  await mongoose.connect(uri);
  const Q = mongoose.connection.collection("questions");

  // Check a few more broken questions to verify the first image is always the table
  const ids = [
    "69e9718e2c62160058d2a63c", // Quantitative - "gathered following data"
    "69e971a02c62160058d2a6f9", // Economics - "oligopoly markets"
    "69e971ae2c62160058d2a78b", // Portfolio - "diagram shows indifference curves"
    "69e971b62c62160058d2a7e3", // Corporate - "competitor offers to acquire"
    "69e971cb2c62160058d2a8c9", // FSA - LIFO (already verified)
  ];

  for (const id of ids) {
    const q = await Q.findOne({ _id: new mongoose.Types.ObjectId(id) });
    if (!q) continue;
    
    const eImgs = (q.images || []).filter(i => i.location === "explanation");
    if (eImgs.length === 0) continue;
    
    const buf = Buffer.from(eImgs[0].data, "base64");
    const outPath = `/tmp/verify-${id}.png`;
    fs.writeFileSync(outPath, buf);
    console.log(`${id} [${q.topic}]: ${q.text.substring(0, 70)}...`);
    console.log(`  First expl image: ${buf.length} bytes → ${outPath}`);
    console.log();
  }

  await mongoose.disconnect();
})();
