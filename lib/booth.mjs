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

/**
 * @param {string} confession
 * @param {string} recipient
 */
async function askAthena(confession, recipient) {
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
      prompt: recipient
        ? `Address this apology to ${recipient}.\n\n${confession}`
        : confession,
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

/** @type {Record<string, string>} */
const colorNames = {
  "#c5364e": "berry red",
  "#e07a3d": "burnt orange",
  "#ffcf70": "butter yellow",
  "#2f6f4e": "forest green",
  "#3d5a80": "slate blue",
  "#4c2142": "deep plum",
};

/**
 * @param {string} value
 */
function allowedImageUrl(value) {
  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase();
    return (
      parsed.protocol === "https:" &&
      (host === "ideogram.ai" || host.endsWith(".ideogram.ai"))
    );
  } catch {
    return false;
  }
}

/**
 * @param {Uint8Array} bytes
 * @param {string | null} header
 */
function imageType(bytes, header) {
  const mime = (header || "").split(";")[0].trim().toLowerCase();
  if (mime === "image/png" || mime === "image/jpeg" || mime === "image/webp") {
    return mime;
  }
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46
  ) {
    return "image/webp";
  }
  return "";
}

/**
 * @param {string} color
 * @param {string} note
 */
function editPrompt(color, note) {
  const keep =
    "Keep the object's shape, position, lighting, and the warm cream studio background exactly the same. No people, no words, no letters.";
  const named = colorNames[color.toLowerCase()];
  const colorLine = named
    ? `Change the object's color to ${named} (${color}).`
    : `Change the object's color to ${color}.`;
  if (color && note) return `${note}. ${colorLine} ${keep}`;
  if (color) return `${colorLine} ${keep}`;
  return `${note}. ${keep}`;
}

/**
 * Recolor or otherwise edit an existing Ideogram picture.
 * Precise Edit copies untouched pixels from the source image.
 * @param {{ imageUrl?: unknown, color?: unknown, note?: unknown }} input
 */
export async function editGesture(input) {
  if (!ideogramKey) {
    throw Object.assign(new Error("Ideogram is not set up."), { status: 500 });
  }

  const imageUrl = String(input.imageUrl || "");
  if (!allowedImageUrl(imageUrl)) {
    throw Object.assign(new Error("That picture cannot be edited."), {
      status: 400,
    });
  }

  const color = String(input.color || "").trim();
  const note = String(input.note || "")
    .replace(/\s+/g, " ")
    .trim();
  if (color && !/^#[0-9a-fA-F]{6}$/.test(color)) {
    throw Object.assign(new Error("Pick a real color."), { status: 400 });
  }
  if (!color && !note) {
    throw Object.assign(new Error("Pick a color or describe the change."), {
      status: 400,
    });
  }
  if (note.length > 200) {
    throw Object.assign(new Error("Keep the change under 200 characters."), {
      status: 400,
    });
  }

  const downloaded = await fetch(imageUrl, {
    redirect: "follow",
    signal: AbortSignal.timeout(20000),
  });
  if (!downloaded.ok || !allowedImageUrl(downloaded.url)) {
    throw Object.assign(
      new Error("That picture expired. Measure the shame again."),
      { status: 400 },
    );
  }

  const bytes = new Uint8Array(await downloaded.arrayBuffer());
  if (bytes.length > 10_000_000) {
    throw Object.assign(new Error("That picture is too large to edit."), {
      status: 400,
    });
  }
  const mime = imageType(bytes, downloaded.headers.get("content-type"));
  if (!mime) {
    throw Object.assign(new Error("That picture cannot be edited."), {
      status: 400,
    });
  }

  const form = new FormData();
  const extension = mime === "image/jpeg" ? "jpg" : mime.split("/")[1];
  form.append("prompt", editPrompt(color, note));
  form.append("quality", "low");
  form.append(
    "image",
    new Blob([bytes], { type: mime }),
    `object.${extension}`,
  );

  const response = await fetch(
    "https://api.ideogram.ai/v2/image/precise-edit/ideogram-4-5",
    {
      method: "POST",
      headers: { "Api-Key": ideogramKey },
      body: form,
      signal: AbortSignal.timeout(60000),
    },
  );
  /** @type {{ data?: { url?: string }[] }} */
  const payload = await response.json().catch(() => ({}));
  const image = payload.data?.find((item) => item.url);
  if (!response.ok || !image?.url) {
    throw Object.assign(new Error("Ideogram could not change the picture."), {
      status: 502,
    });
  }
  return { imageUrl: image.url };
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

/**
 * @param {unknown} confession
 * @param {unknown} [recipient]
 */
export async function confess(confession, recipient = "") {
  const text = String(confession || "").trim();
  const who = String(recipient || "").trim().slice(0, 40);
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

  const verdict = { ...(await askAthena(text, who)), recipient: who };
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
