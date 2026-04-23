const { PDFParse } = require("pdf-parse");
const fs = require("fs");
const path = require("path");

function normalize(s) {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

(async () => {
  // Find the answer PDF for "Equity Investments" UWorld QBank
  const baseDir = "Mocks and QBanks/UWORLD QBank 2024";
  const dirs = fs.readdirSync(baseDir);
  
  // Find equity dir
  const equityDir = dirs.find(d => d.toLowerCase().includes("equity"));
  console.log("Equity dir:", equityDir);
  
  if (!equityDir) return;
  
  const fullDir = path.join(baseDir, equityDir);
  const files = fs.readdirSync(fullDir);
  const answerFiles = files.filter(f => f.toLowerCase().includes("answer") && f.endsWith(".pdf"));
  console.log("Answer files:", answerFiles);
  
  // Parse each and look for "gathered.*company stock" or "Gordon growth"
  for (const af of answerFiles) {
    const pdfPath = path.join(fullDir, af);
    const buf = new Uint8Array(fs.readFileSync(pdfPath));
    const p = new PDFParse(buf);
    await p.load();
    const result = await p.getText();
    let text = result.pages.map(pg => pg.text).join("\n");
    text = text.replace(/[\uE000-\uF8FF]/g, "");
    
    // Split into questions
    const chunks = text.split(/(?=(?:^|\n)\d+\.\s+[A-Z])/);
    
    for (const chunk of chunks) {
      const hm = chunk.match(/(?:^|\n)(\d+)\.\s+([\s\S]*?)(?=\n\s*\t?\s*[ABC]\.\s)/);
      if (!hm) continue;
      
      const qText = hm[2].trim();
      // Check if this matches our target questions
      if (/gathered.*company stock/i.test(qText) || /Gordon growth/i.test(qText) || /LIFO.*20X8/i.test(qText) || /manufacturing.*LIFO/i.test(qText)) {
        console.log(`\n=== ${af} Q#${hm[1]} (${qText.length} chars) ===`);
        console.log(qText.substring(0, 500));
        console.log("---");
        console.log("First 40 norm:", normalize(qText).substring(0, 40));
      }
    }
  }
  
  // Also check Financial Statement Analysis for LIFO
  const fsaDir = dirs.find(d => d.toLowerCase().includes("financial statement"));
  if (fsaDir) {
    console.log("\n\nFSA dir:", fsaDir);
    const fsaFullDir = path.join(baseDir, fsaDir);
    const fsaFiles = fs.readdirSync(fsaFullDir);
    const fsaAnswerFiles = fsaFiles.filter(f => f.toLowerCase().includes("answer") && f.endsWith(".pdf"));
    
    for (const af of fsaAnswerFiles) {
      const pdfPath = path.join(fsaFullDir, af);
      const buf = new Uint8Array(fs.readFileSync(pdfPath));
      const p = new PDFParse(buf);
      await p.load();
      const result = await p.getText();
      let text = result.pages.map(pg => pg.text).join("\n");
      text = text.replace(/[\uE000-\uF8FF]/g, "");
      
      const chunks = text.split(/(?=(?:^|\n)\d+\.\s+[A-Z])/);
      
      for (const chunk of chunks) {
        const hm = chunk.match(/(?:^|\n)(\d+)\.\s+([\s\S]*?)(?=\n\s*\t?\s*[ABC]\.\s)/);
        if (!hm) continue;
        
        const qText = hm[2].trim();
        if (/LIFO.*20X8/i.test(qText) || /manufacturing.*LIFO/i.test(qText)) {
          console.log(`\n=== ${af} Q#${hm[1]} (${qText.length} chars) ===`);
          console.log(qText.substring(0, 500));
          console.log("---");
          console.log("First 40 norm:", normalize(qText).substring(0, 40));
        }
      }
    }
  }
})();
