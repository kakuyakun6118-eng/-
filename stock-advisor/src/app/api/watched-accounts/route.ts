import { NextRequest, NextResponse } from "next/server";
import { addWatchedAccount, getWatchedAccounts, removeWatchedAccount } from "@/lib/watchedAccounts";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await getWatchedAccounts());
}

export async function POST(req: NextRequest) {
  const { handle, label } = await req.json();
  if (!handle) return NextResponse.json({ error: "ユーザー名は必須です" }, { status: 400 });
  try {
    return NextResponse.json(await addWatchedAccount(String(handle), label ? String(label) : undefined), { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "追加に失敗しました" }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  const handle = new URL(req.url).searchParams.get("handle");
  if (!handle) return NextResponse.json({ error: "handle は必須です" }, { status: 400 });
  if (!(await removeWatchedAccount(handle))) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
