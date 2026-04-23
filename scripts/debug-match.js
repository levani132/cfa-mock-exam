const fs = require("fs");
const path = require("path");

async function extractText(pdfPath) {
  const { PDFParse } = require("pdf-parse");
  const buf = new Uint8Array(fs.readFileSync(pdfPath));
  const p = new PDFParse(buf);
  await p.load();
  const result = await p.getText();
  let text = result.pages.map(pg => pg.text).join("\n");
  text = text.replace(/[\uE000-\uF8FF]/g, "");
  return text;
}

function normalize(s) {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

(async () => {
  const pdfPath = "Mocks and QBanks/UWORLD QBank 2024/6. Equity Investments/6.08 Equity Valuation Concepts And Basic Tools.pdf";
  const text = await extractText(pdfPath);
  
  // Split by "Question N" pattern
  const chunks = text.split(/(?=Question\s+\d+\s*\n)/i);
  
  // Parse each question
  for (const chunk of chunks) {
    const numMatch = chunk.match(/^Question\s+(\d+)\s*\n([\s\S]*?)(?=\n\s*[ABC]\.\s)/i);
    if (!numMatch) continue;
    const num = parseInt(numMatch[1], 10);
    const qText = numMatch[2].trim();
    const norm50 = normalize(qText).substring(0, 50);
    
    // Show all questions - focus on those mentioning "gathered" or "following"
    if (/gathered|following.*information|Gordon/i.test(qText)) {
      console.log(`Q${num}: (${qText.length} chars) first50="${norm50}"`);
      console.log(`  Full text: ${qText.substring(0, 200)}`);
      console.log();
    }
  }
  
  // Now show what the DB has for the target question
  const mongoose = require("mongoose");
  const uri = fs.readFileSync(".env.local", "utf8").match(/MONGODB_URI=(.*)/)?.[1];
  await mongoose.connect(uri);
  const Q = mongoose.connection.collection("questions");
  const dbQ = await Q.findOne({ _id: new mongoose.Types.ObjectId("69e971f32c62160058d2aa7c") });
  console.log("DB question first50:", normalize(dbQ.text).substring(0, 50));
  console.log("DB text:", dbQ.text.substring(0, 200));
  
  await mongoose.disconnect();
})();
