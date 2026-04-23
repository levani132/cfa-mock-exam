const mongoose = require("mongoose");
const fs = require("fs");
const uri = fs.readFileSync(".env.local", "utf8").match(/MONGODB_URI=(.*)/)?.[1];

(async () => {
  await mongoose.connect(uri);
  const Q = mongoose.connection.collection("questions");
  const ObjectId = mongoose.Types.ObjectId;

  // Check both reported questions
  for (const id of ["69e971f32c62160058d2aa7c", "69e971cb2c62160058d2a8c9"]) {
    const q = await Q.findOne({ _id: new ObjectId(id) });
    console.log(`\n=== ${id} ===`);
    console.log("Source:", q.source);
    console.log("Topic:", q.topic);
    console.log("Text:", q.text);
    console.log("Images:", q.images?.length || 0);
    if (q.images?.length) {
      q.images.forEach((img, i) => {
        console.log(`  Image ${i}: loc=${img.location} type=${img.contentType} dataLen=${img.data?.length || 0}`);
      });
    }
  }

  // Count suspicious by image status
  const all = await Q.find({}).project({ _id: 1, text: 1, images: 1 }).toArray();
  let withImgs = 0, withoutImgs = 0;
  for (const q of all) {
    if (!q.text) continue;
    const m = q.text.match(/the following[\s\S]{0,80}?:\s*\n/i);
    if (!m) continue;
    const afterColon = q.text.substring(m.index + m[0].length).trim();
    if (afterColon.length < 200 && /closest to:|most likely|least likely|best described/i.test(afterColon)) {
      if ((q.images?.length || 0) > 0) withImgs++;
      else withoutImgs++;
    }
  }
  console.log(`\nSuspicious with images: ${withImgs}`);
  console.log(`Suspicious without images: ${withoutImgs}`);

  await mongoose.disconnect();
})();
