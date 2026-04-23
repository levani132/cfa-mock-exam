const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const baseDir = "Mocks and QBanks/UWORLD QBank 2024";

// Find the equity valuation question PDF
const equityDir = path.join(baseDir, "6. Equity Investments");
const files = fs.readdirSync(equityDir);

const qFile = files.find(f => f.includes("6.08") && !f.includes("Answer") && f.endsWith(".pdf"));
console.log("Question PDF:", qFile);

if (qFile) {
  const fullPath = path.join(equityDir, qFile);
  // List images with pdfimages
  try {
    const output = execSync(`pdfimages -list "${fullPath}"`, { encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 });
    const lines = output.split("\n");
    console.log("Image list header:", lines[0], lines[1]);
    
    let count = 0;
    for (const line of lines.slice(2)) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 5) continue;
      const page = parts[0];
      const num = parts[1];
      const type = parts[2];
      const width = parts[3];
      const height = parts[4];
      if (parseInt(width) >= 50 && parseInt(height) >= 20) {
        count++;
        if (count <= 20) console.log(`  page=${page} num=${num} type=${type} ${width}x${height}`);
      }
    }
    console.log(`Total significant images: ${count}`);
  } catch (e) {
    console.log("pdfimages not available or error:", e.message);
  }
}

// Also check FSA inventory question PDF
const fsaDir = path.join(baseDir, "5. Financial Statement Analysis");
const fsaFiles = fs.readdirSync(fsaDir);
const fsaQFile = fsaFiles.find(f => f.includes("5.06") && !f.includes("Answer") && f.endsWith(".pdf"));
console.log("\nFSA Question PDF:", fsaQFile);

if (fsaQFile) {
  const fullPath = path.join(fsaDir, fsaQFile);
  try {
    const output = execSync(`pdfimages -list "${fullPath}"`, { encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 });
    const lines = output.split("\n");
    let count = 0;
    for (const line of lines.slice(2)) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 5) continue;
      const width = parts[3];
      const height = parts[4];
      if (parseInt(width) >= 50 && parseInt(height) >= 20) count++;
    }
    console.log(`Total significant images: ${count}`);
  } catch (e) {
    console.log("pdfimages not available:", e.message);
  }
}
