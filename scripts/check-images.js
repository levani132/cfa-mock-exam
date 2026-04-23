const mongoose = require("mongoose");
const fs = require("fs");
const uri = fs.readFileSync(".env.local", "utf8").match(/MONGODB_URI=(.*)/)?.[1];

(async () => {
  await mongoose.connect(uri);
  const Q = mongoose.connection.collection("questions");

  // Check all unique image locations
  const withImages = await Q.find({ images: { $exists: true, $not: { $size: 0 } } })
    .project({ _id: 1, images: 1 })
    .toArray();

  const locations = {};
  let totalImages = 0;
  for (const q of withImages) {
    for (const img of q.images || []) {
      locations[img.location] = (locations[img.location] || 0) + 1;
      totalImages++;
    }
  }

  console.log("Questions with images:", withImages.length);
  console.log("Total images:", totalImages);
  console.log("Location distribution:", locations);

  // Check a question with images - what does the image data look like?
  const sample = await Q.findOne({ _id: new mongoose.Types.ObjectId("69e971f32c62160058d2aa7c") });
  if (sample?.images?.[0]) {
    const img = sample.images[0];
    console.log("\nSample image:");
    console.log("  location:", img.location);
    console.log("  contentType:", img.contentType);
    console.log("  data type:", typeof img.data);
    console.log("  data length:", img.data?.length || 0);
    // Check if it's a Buffer/Binary
    if (img.data?.buffer) {
      console.log("  Is Buffer: true");
      const header = Buffer.from(img.data.buffer).slice(0, 8);
      console.log("  Header bytes:", Array.from(header));
    }
  }

  await mongoose.disconnect();
})();
