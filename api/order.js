import { retrieveOrder } from "../lib/checkout.mjs";

/**
 * @param {import("node:http").IncomingMessage & { query?: Record<string, string | string[] | undefined> }} req
 * @param {import("node:http").ServerResponse & { status: (code: number) => { json: (body: unknown) => void } }} res
 */
export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const fromQuery = req.query?.session_id;
    const queryId = Array.isArray(fromQuery) ? fromQuery[0] : fromQuery;
    const sessionId =
      queryId ||
      new URL(req.url || "/", "http://localhost").searchParams.get(
        "session_id",
      );
    res.status(200).json(await retrieveOrder(sessionId));
  } catch (error) {
    const failure = /** @type {{ status?: number, message?: string }} */ (
      error
    );
    res
      .status(failure.status || 500)
      .json({ error: failure.message || "Order lookup failed." });
  }
}
