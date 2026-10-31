import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** @param {string} file */
function loadEnv(file) {
  if (!existsSync(file)) return {};
  return Object.fromEntries(
    readFileSync(file, "utf8")
      .split(/\r?\n/)
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const index = line.indexOf("=");
        let value = line.slice(index + 1).trim();
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        return [line.slice(0, index).trim(), value];
      }),
  );
}

const env = {
  ...loadEnv(join(import.meta.dirname, "..", ".env")),
  ...process.env,
};

const apiBase = (
  env.ATHENA_ATHENA_API_BASE_URL || "https://athenachat.bot"
).replace(/\/$/, "");
const publicUrl =
  env.ATHENA_ATHENA_AGENT_PUBLIC_URL ||
  "https://athenachat.bot/chatbot/agent/sorryometer-707c093a";
const slug = publicUrl.split("/").filter(Boolean).pop();
const ideogramKey = env.IDEOGRAM_API_KEY || env.ATHENA_API_KEY || "";

/** @param {string} text */
function parseApology(text) {
  const source = text.trim();
  const scoreMatch = source.match(/SCORE:\s*(\d+)/i);
  /** @param {string} label */
  const section = (label) => {
    const match = source.match(
      new RegExp(
        `${label}:\\s*([\\s\\S]*?)(?=\\n(?:LEVEL \\d+|GESTURE|SCORE)\\s*:|$)`,
        "i",
      ),
    );
    return match?.[1]?.replace(/\s+/g, " ").trim() || "";
  };
  return {
    score: scoreMatch ? Number(scoreMatch[1]) : null,
    level2: section("LEVEL 2"),
    level6: section("LEVEL 6"),
    level10: section("LEVEL 10"),
    gesture: section("GESTURE"),
    raw: source,
  };
}

/** @param {string} confession */
async function askAthena(confession) {
  const conversationId = randomUUID();
  const messageId = randomUUID();
  const headers = {
    "content-type": "application/json",
    "X-Chat-Viewer-Id": randomUUID(),
    "X-Chat-Run-Access-Key": randomUUID(),
  };

  const conversation = await fetch(`${apiBase}/chatbot/conversations`, {
    method: "POST",
    headers,
    signal: AbortSignal.timeout(15000),
    body: JSON.stringify({
      roomId: `guest:${slug}`,
      id: conversationId,
      name: confession.slice(0, 48),
      avatar: "/assets/athena/athena-logo.svg",
      type: "ai",
      members: [
        { name: "Guest", email: "", avatar: "" },
        {
          name: "Sorryometer",
          slug,
          email: "ai@devfortress.com",
          avatar: "/assets/athena/athena-logo.svg",
        },
      ],
    }),
  });

  if (!conversation.ok) {
    throw Object.assign(new Error("The booth could not open a new case."), {
      status: 502,
    });
  }

  const prompt = await fetch(`${apiBase}/chatbot/bot/${slug}/prompt`, {
    method: "POST",
    headers,
    signal: AbortSignal.timeout(45000),
    body: JSON.stringify({
      conversationId,
      prompt: confession,
      messages: "[]",
      audio: null,
      sourceMessageId: messageId,
      messageId,
      outputType: null,
      browserLocale: "en",
    }),
  });

  if (!prompt.ok || !prompt.body) {
    throw Object.assign(new Error("Sorryometer refused to take the case."), {
      status: 502,
    });
  }

  const reader = prompt.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let apology = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let event;
      try {
        event = JSON.parse(trimmed);
      } catch {
        continue;
      }
      if (event.messageData || event.event === "run_finalized") continue;
      if (event.outputType === "text" && typeof event.response === "string") {
        apology += event.response;
      }
    }
  }

  if (!apology.trim()) {
    throw Object.assign(
      new Error("The bureau stared into space and said nothing."),
      {
        status: 502,
      },
    );
  }

  return parseApology(apology);
}

/** @param {string} gesture */
async function drawGesture(gesture) {
  if (!ideogramKey || !gesture) return { imageUrl: null };
  const response = await fetch(
    "https://api.ideogram.ai/v2/image/generate/ideogram-4-5",
    {
      method: "POST",
      headers: {
        "Api-Key": ideogramKey,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(45000),
      body: JSON.stringify({
        prompt: `A single physical object photographed on a warm cream studio background, no people, no words, no letters: ${gesture}`,
        magic_prompt: "off",
        quality: "low",
        size: "1024x1024",
        num_images: 1,
      }),
    },
  );
  /** @type {{ data?: { url?: string }[] }} */
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      imageUrl: null,
      imageError: "Ideogram could not draw the object.",
    };
  }
  const image = payload.data?.find((item) => item.url);
  return { imageUrl: image?.url || null };
}

/** @param {unknown} confession */
export async function confess(confession) {
  const text = String(confession || "").trim();
  if (!text) {
    throw Object.assign(new Error("Confess something first."), { status: 400 });
  }
  if (text.length > 400) {
    throw Object.assign(
      new Error(
        "Keep it under 400 characters. This is petty crime, not a memoir.",
      ),
      { status: 400 },
    );
  }

  const verdict = await askAthena(text);
  if (verdict.score === 0) return { ...verdict, imageUrl: null };
  try {
    const picture = await drawGesture(verdict.gesture);
    return { ...verdict, ...picture };
  } catch {
    return {
      ...verdict,
      imageUrl: null,
      imageError: "Ideogram could not draw the object.",
    };
  }
}
