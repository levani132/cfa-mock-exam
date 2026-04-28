import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { User } from "@/lib/models/User";

export async function GET(req: NextRequest) {
  try {
    await connectDB();

    const query = req.nextUrl.searchParams.get("q")?.trim();

    if (!query || query.length < 1) {
      return NextResponse.json([]);
    }

    // Search by name or numericId
    const results = await User.find({
      $or: [
        { name: { $regex: query, $options: "i" } },
        { numericId: isNaN(Number(query)) ? undefined : Number(query) },
      ],
    })
      .select("numericId name")
      .limit(10)
      .lean();

    return NextResponse.json(results);
  } catch (err) {
    console.error("Failed to search users:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
