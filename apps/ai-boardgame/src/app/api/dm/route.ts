import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

const client = new Anthropic();

const SYSTEM_PROMPT = `You are an experienced, creative Dungeon Master running a D&D 5e adventure.
Your role:
- Narrate the world vividly but concisely (2-4 sentences per response)
- Play all NPCs with distinct voices
- Ask for dice rolls when appropriate (format: "Roll [skill/ability]. DC [number].")
- Remember context from the conversation history
- Keep the pacing tight — move the story forward
- Never make decisions for the players; only describe outcomes of their declared actions
Tone: immersive, slightly dramatic, fair.`;

export async function POST(req: NextRequest) {
  const { messages, playerAction } = await req.json();

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 256,
    system: SYSTEM_PROMPT,
    messages: [
      ...messages,
      { role: "user", content: playerAction },
    ],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";

  return NextResponse.json({ narration: text });
}
