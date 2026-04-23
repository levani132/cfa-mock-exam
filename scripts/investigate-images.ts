/**
 * Investigate images in PDFs: count pages with images, detect image types/sizes.
 *
 * Usage: npx tsx scripts/investigate-images.ts
 */

import fs from "fs";
import path from "path";

const MOCKS_DIR = "/Users/levanberoshvili/Projects/cfa-mock-exam/Mocks and QBanks";

async function investigateImages() {
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");

  // Collect all PDFs
  const pdfs: string[] = [];
  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.toLowerCase().endsWith(".pdf")) pdfs.push(full);
    }
  }
  walk(MOCKS_DIR);
  console.log(`Found ${pdfs.length} PDFs\n`);

  let totalImages = 0;
  let totalPagesWithImages = 0;

  for (const pdfPath of pdfs) {
    const data = new Uint8Array(fs.readFileSync(pdfPath));
    const doc = await pdfjsLib.getDocument({ data }).promise;
    let fileImages = 0;
    let filePagesWithImages = 0;

    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const ops = await page.getOperatorList();
      let pageHasImage = false;

      for (let i = 0; i < ops.fnArray.length; i++) {
        // OPS.paintImageXObject = 85, paintJpegXObject = 82, paintImageMaskXObject = 83
        if (ops.fnArray[i] === 85 || ops.fnArray[i] === 82 || ops.fnArray[i] === 83) {
          pageHasImage = true;
          fileImages++;
        }
      }
      if (pageHasImage) filePagesWithImages++;
    }

    if (fileImages > 0) {
      const shortPath = pdfPath.replace(MOCKS_DIR + "/", "");
      console.log(`${shortPath}: ${fileImages} images across ${filePagesWithImages}/${doc.numPages} pages`);
    }

    totalImages += fileImages;
    totalPagesWithImages += filePagesWithImages;
    doc.destroy();
  }

  console.log(`\nTotal: ${totalImages} images across ${totalPagesWithImages} pages`);
}

investigateImages().catch(console.error);
