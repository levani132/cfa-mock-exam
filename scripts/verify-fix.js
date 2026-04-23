const mongoose = require("mongoose");
const fs = require("fs");
const uri = fs.readFileSync(".env.local", "utf8").match(/MONGODB_URI=(.*)/)?.[1];

(async () => {
  await mongoose.connect(uri);
  const Q = mongoose.connection.collection("questions");

  const ids = [
    "69e971f32c62160058d2aa7c", // equity - Gordon growth model
    "69e971cb2c62160058d2a8c9", // FSA - LIFO
  ];

  for (const id of ids) {
    const q = await Q.findOne({ _id: new mongoose.Types.ObjectId(id) });
    const qImgs = (q.images || []).filter(i => i.location === "question");
    const eImgs = (q.images || []).filter(i => i.location === "explanation");
    console.log(`${id}: ${qImgs.length} question imgs, ${eImgs.length} explanation imgs`);
  }

  await mongoose.disconnect();
})();
