import mongoose from "mongoose";
import fs from "fs";

async function main() {
  const env = fs.readFileSync(".env.local","utf8");
  for(const l of env.split("\n")){const[k,...v]=l.split("=");if(k&&v.length)process.env[k.trim()]=v.join("=").trim();}
  await mongoose.connect(process.env.MONGODB_URI!);
  const Q = mongoose.connection.collection("questions");
  const withImages = await Q.countDocuments({images:{$exists:true,$not:{$size:0}}});
  const totalImages = await Q.aggregate([{$project:{count:{$size:{$ifNull:["$images",[]]}}}},{$group:{_id:null,total:{$sum:"$count"}}}]).toArray();
  const sample = await Q.findOne({images:{$exists:true,$not:{$size:0}}},{text:1,"images.location":1,"images.contentType":1});
  console.log("Questions with images:", withImages);
  console.log("Total images:", totalImages[0]?.total || 0);
  if(sample) console.log("Sample:", JSON.stringify({text: (sample.text as string).substring(0,100), imageCount: (sample.images as any[]).length, locations: (sample.images as any[]).map((i:any)=>i.location)},null,2));
  await mongoose.disconnect();
}
main().catch(console.error);
