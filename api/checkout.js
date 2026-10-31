import { createCheckout } from "../lib/checkout.mjs";

/**
 * @param {import("node:http").IncomingMessage & { body?: unknown }} req
 * @param {import("node:http").ServerResponse & { status: (code: number) => { json: (body: unknown) => void } }} res
 */
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const payload =
      typeof req.body === "string"
        ? JSON.parse(req.body || "{}")
        : req.body || {};
    const origin = `${req.headers["x-forwarded-proto"] || "https"}://${req.headers.host}`;
    const result = await createCheckout({
      origin,
      plan: payload.plan,
      gesture: payload.gesture,
      imageUrl: payload.imageUrl,
    });
    res.status(200).json(result);
  } catch (error) {
    const failure = /** @type {{ status?: number, message?: string }} */ (
      error
    );
    res
      .status(failure.status || 500)
      .json({ error: failure.message || "Checkout failed." });
  }
}
