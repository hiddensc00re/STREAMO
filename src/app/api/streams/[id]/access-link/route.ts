import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { looksSafeId } from "@/lib/sanitize";
import { ownerTokenMatches } from "@/lib/owner-token";
import { createAccessToken, hashAccessToken } from "@/lib/stream-access";
import { SlidingWindowLimiter } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
const limiter = new SlidingWindowLimiter(12, 60_000);

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!looksSafeId(id)) return NextResponse.json({ error: "Event not found." }, { status: 404 });
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
  if (!limiter.consume(ip)) return NextResponse.json({ error: "Too many attempts." }, { status: 429 });
  const ownerToken = request.headers.get("authorization")?.replace(/^Bearer /i, "") ?? "";
  const stream = await prisma.stream.findUnique({ where: { id } });
  if (!stream || !ownerTokenMatches(ownerToken, stream.ownerTokenHash)) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }
  if (!stream.isPrivate) return NextResponse.json({ error: "This event is public." }, { status: 409 });
  const accessToken = createAccessToken();
  await prisma.stream.update({ where: { id }, data: { accessTokenHash: hashAccessToken(accessToken) } });
  return NextResponse.json({ accessToken }, { headers: { "Cache-Control": "no-store" } });
}
