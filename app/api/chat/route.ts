import { NextRequest, NextResponse } from "next/server";
import { kvGet, kvSet, KEYS } from "@/lib/kv";
import { requireUserId, unauthorized } from "@/lib/auth";
import { askClaude } from "@/lib/anthropic";
import { buildProfileContext } from "@/lib/context";
import { todayKey } from "@/lib/date";
import { recordActivity } from "@/lib/stats";
import { ChatMessage, EMPTY_PROFILE, Profile } from "@/lib/types";

const MAX_HISTORY = 20;

const SYSTEM_PROMPT = `You are the user's personal Chief of Staff. You always have their
5 goals and current task list as context (provided below). Be direct, warm, and
practical — like a sharp ops person who knows them well. Help them think
through priorities, unblock decisions, and stay honest about progress on their
goals. Keep replies conversational and reasonably short unless they ask for
depth.`;

export async function GET() {
  const userId = await requireUserId();
  if (!userId) return unauthorized();

  const history = (await kvGet<ChatMessage[]>(KEYS.chatHistory(userId))) ?? [];
  return NextResponse.json({ history });
}

export async function POST(req: NextRequest) {
  const userId = await requireUserId();
  if (!userId) return unauthorized();

  const body = await req.json();
  const userText = typeof body.message === "string" ? body.message.trim() : "";
  if (!userText) {
    return NextResponse.json({ error: "Message is required." }, { status: 400 });
  }

  const profile = (await kvGet<Profile>(KEYS.profile(userId))) ?? EMPTY_PROFILE;
  const history = (await kvGet<ChatMessage[]>(KEYS.chatHistory(userId))) ?? [];

  const userMessage: ChatMessage = {
    role: "user",
    content: userText,
    at: new Date().toISOString(),
  };

  const updatedHistory = [...history, userMessage].slice(-MAX_HISTORY);
  const context = buildProfileContext(profile);
  const system = `${SYSTEM_PROMPT}\n\n${context}`;

  let reply: string;
  try {
    reply = await askClaude({
      system,
      messages: updatedHistory.map((m) => ({ role: m.role, content: m.content })),
      maxTokens: 1024,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const assistantMessage: ChatMessage = {
    role: "assistant",
    content: reply,
    at: new Date().toISOString(),
  };

  const finalHistory = [...updatedHistory, assistantMessage].slice(-MAX_HISTORY);
  await kvSet(KEYS.chatHistory(userId), finalHistory);
  await recordActivity(userId, todayKey());

  return NextResponse.json({ history: finalHistory });
}
