const mongoose = require("mongoose");
const fs = require("fs");
const uri = fs.readFileSync(".env.local", "utf8").match(/MONGODB_URI=(.*)/)?.[1];

(async () => {
  await mongoose.connect(uri);
  const Q = mongoose.connection.collection("questions");

  // Get the specific broken question
  const q = await Q.findOne({ _id: new mongoose.Types.ObjectId("69e971f32c62160058d2aa7c") });
  
  console.log("Question text:");
  console.log(q.text);
  console.log("\nImages:", q.images.length);
  
  // Save each image to /tmp for inspection
  for (let i = 0; i < q.images.length; i++) {
    const img = q.images[i];
    const buf = Buffer.from(img.data, "base64");
    const outPath = `/tmp/q-${q._id}-img-${i}.png`;
    fs.writeFileSync(outPath, buf);
    console.log(`  Image ${i}: location=${img.location}, size=${buf.length} bytes → ${outPath}`);
  }

  // Also check another broken question: the LIFO one
  const q2 = await Q.findOne({ _id: new mongoose.Types.ObjectId("69e971cb2c62160058d2a8c9") });
  console.log("\nLIFO question text:");
  console.log(q2.text);
  console.log("\nImages:", q2.images.length);
  for (let i = 0; i < q2.images.length; i++) {
    const img = q2.images[i];
    const buf = Buffer.from(img.data, "base64");
    const outPath = `/tmp/q-${q2._id}-img-${i}.png`;
    fs.writeFileSync(outPath, buf);
    console.log(`  Image ${i}: location=${img.location}, size=${buf.length} bytes → ${outPath}`);
  }

  await mongoose.disconnect();
})();
