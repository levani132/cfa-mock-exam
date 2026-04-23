const fs = require("fs");
const path = require("path");

function normalize(s) {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

async function buildPageMap(pdfPath) {
  const pdfjsLib = require("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const doc = await pdfjsLib.getDocument({ data }).promise;
  const pageMap = new Map();
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const items = content.items;
    const pageText = items.map(i => i.str || "").join(" ");
    const qMatch = pageText.match(/Question\s+(\d+)/);
    if (qMatch) pageMap.set(p, parseInt(qMatch[1], 10));
  }
  doc.destroy();
  return pageMap;
}

(async () => {
  const pdfPath = "Mocks and QBanks/UWORLD QBank 2024/6. Equity Investments/6.08 Equity Valuation Concepts And Basic Tools.pdf";
  const pageMap = await buildPageMap(pdfPath);
  
  console.log("Page → Question Number mapping:");
  for (const [page, qNum] of [...pageMap.entries()].sort((a,b) => a[0] - b[0])) {
    console.log(`  Page ${page} → Q${qNum}`);
  }
  
  // Now check which pages have images
  const { execSync } = require("child_process");
  const listOutput = execSync(`pdfimages -list "${pdfPath}"`, { encoding: "utf-8" });
  const lines = listOutput.split("\n").slice(2);
  
  console.log("\nImages by page:");
  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 5) continue;
    const page = parseInt(parts[0]);
    const width = parseInt(parts[3]);
    const height = parseInt(parts[4]);
    if (width >= 50 && height >= 20) {
      // Find which question this belongs to
      let qNum = pageMap.get(page);
      if (!qNum) {
        for (let p = page - 1; p >= 1; p--) {
          if (pageMap.has(p)) { qNum = pageMap.get(p); break; }
        }
      }
      console.log(`  Page ${page} (Q${qNum || "?"}): ${width}x${height}`);
    }
  }

  // Now check DB: find all equity questions matching "an analyst has gathered the following information"
  const mongoose = require("mongoose");
  const uri = fs.readFileSync(".env.local", "utf8").match(/MONGODB_URI=(.*)/)?.[1];
  await mongoose.connect(uri);
  const Q = mongoose.connection.collection("questions");
  
  const matches = await Q.find({
    text: /^An analyst has gathered the following information/,
    source: /UWorld/i,
    topic: "Equity Investments"
  }).project({ _id: 1, text: 1, images: 1 }).toArray();
  
  console.log(`\nDB questions matching "An analyst has gathered..." in Equity (${matches.length}):`);
  for (const m of matches) {
    const qImgs = (m.images || []).filter(i => i.location === "question").length;
    const eImgs = (m.images || []).filter(i => i.location === "explanation").length;
    console.log(`  ${m._id}: ${m.text.substring(0, 80)}... (qImgs=${qImgs}, eImgs=${eImgs})`);
    console.log(`    last30norm: "${normalize(m.text).slice(-30)}"`);
  }
  
  await mongoose.disconnect();
})();
