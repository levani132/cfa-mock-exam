import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { User } from "@/lib/models/User";

export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const { numericId, name } = await req.json();

    if (!numericId || typeof numericId !== "number") {
      return NextResponse.json({ error: "Valid numeric ID required" }, { status: 400 });
    }

    const existing = await User.findOne({ numericId });
    if (existing) {
      return NextResponse.json({ error: "User with this ID already exists" }, { status: 409 });
    }

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const user = await User.create({ numericId, name: name.trim() });
    return NextResponse.json({ user: { numericId: user.numericId, name: user.name } });
  } catch  (e) {
    console.log('error', e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    await connectDB();
    const id = req.nextUrl.searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "ID parameter required" }, { status: 400 });
    }

    const numericId = parseInt(id, 10);
    if (isNaN(numericId)) {
      return NextResponse.json({ error: "Valid numeric ID required" }, { status: 400 });
    }

    const user = await User.findOne({ numericId });
    if (!user) {
      return NextResponse.json({ exists: false });
    }

    return NextResponse.json({ exists: true, user: { numericId: user.numericId, name: user.name } });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
