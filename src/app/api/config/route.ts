import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const signalingUrl =
    process.env.SIGNALING_PUBLIC_URL ||
    process.env.NEXT_PUBLIC_SIGNALING_URL ||
    "http://localhost:4001";

  return NextResponse.json({ signalingUrl });
}
