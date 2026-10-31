import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { extname, join, resolve, sep } from "node:path";
import { confess } from "./lib/booth.mjs";
import { createCheckout, retrieveOrder } from "./lib/checkout.mjs";

const root = join(import.meta.dirname, "public");
const port = Number(process.env.PORT || 4173);

/** @type {Record<string, string>} */
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
};

/**
 * @param {import("node:http").ServerResponse} res
 * @param {number} statusCode
 * @param {string | Buffer} body
 * @param {string} [type]
 */
function send(res, statusCode, body, type = "application/json; charset=utf-8") {
  res.writeHead(statusCode, {
    "content-type": type,
    "cache-control": "no-store",
  });
  res.end(body);
}

/** @param {import("node:http").IncomingMessage} req */
function readBody(req) {
  return new Promise((resolveBody, reject) => {
    /** @type {Buffer[]} */
    const chunks = [];
    req.on("data", (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    req.on("end", () => resolveBody(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

/**
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 */
function serveStatic(req, res) {
  const url = new URL(req.url || "/", "http://localhost");
  const requested =
    url.pathname === "/" ? "index.html" : url.pathname.replace(/^\/+/, "");
  const path = resolve(root, requested);
  if ((path !== root && !path.startsWith(root + sep)) || !existsSync(path)) {
    send(res, 404, "Not found", "text/plain; charset=utf-8");
    return;
  }
  send(
    res,
    200,
    readFileSync(path),
    types[extname(path)] || "application/octet-stream",
  );
}

const server = createServer(async (req, res) => {
  try {
    if (
      req.method === "POST" &&
      (req.url === "/api/confess" || req.url === "/api/checkout")
    ) {
      const payload = JSON.parse((await readBody(req)) || "{}");
      if (req.url === "/api/checkout") {
        const origin = `http://${req.headers.host}`;
        send(
          res,
          200,
          JSON.stringify(
            await createCheckout({
              origin,
              plan: payload.plan,
              gesture: payload.gesture,
              imageUrl: payload.imageUrl,
            }),
          ),
        );
        return;
      }
      send(res, 200, JSON.stringify(await confess(payload.confession)));
      return;
    }

    const path = req.url || "";
    if (req.method === "GET" && path.startsWith("/api/order")) {
      const sessionId = new URL(path, "http://localhost").searchParams.get(
        "session_id",
      );
      send(res, 200, JSON.stringify(await retrieveOrder(sessionId)));
      return;
    }

    if (req.method === "GET") {
      serveStatic(req, res);
      return;
    }

    send(res, 405, JSON.stringify({ error: "Method not allowed" }));
  } catch (error) {
    const failure = /** @type {{ status?: number, message?: string }} */ (
      error
    );
    send(
      res,
      failure.status || 500,
      JSON.stringify({ error: failure.message || "The booth jammed." }),
    );
  }
});

server.listen(port, () => {
  console.log(`Sorryometer listening on http://localhost:${port}`);
});
