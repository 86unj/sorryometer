import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { extname, join, resolve, sep } from "node:path";
import { confess } from "./lib/booth.mjs";

const root = join(import.meta.dirname, "public");
const port = Number(process.env.PORT || 4173);

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
};

function send(res, status, body, type = "application/json; charset=utf-8") {
  res.writeHead(status, { "content-type": type, "cache-control": "no-store" });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolveBody, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolveBody(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function serveStatic(req, res) {
  const url = new URL(req.url, "http://localhost");
  const requested = url.pathname === "/" ? "index.html" : url.pathname.replace(/^\/+/, "");
  const path = resolve(root, requested);
  if ((path !== root && !path.startsWith(root + sep)) || !existsSync(path)) {
    send(res, 404, "Not found", "text/plain; charset=utf-8");
    return;
  }
  send(res, 200, readFileSync(path), types[extname(path)] || "application/octet-stream");
}

const server = createServer(async (req, res) => {
  try {
    if (req.method === "POST" && req.url === "/api/confess") {
      const payload = JSON.parse((await readBody(req)) || "{}");
      send(res, 200, JSON.stringify(await confess(payload.confession)));
      return;
    }

    if (req.method === "GET") {
      serveStatic(req, res);
      return;
    }

    send(res, 405, JSON.stringify({ error: "Method not allowed" }));
  } catch (error) {
    send(
      res,
      error.status || 500,
      JSON.stringify({ error: error.message || "The booth jammed." }),
    );
  }
});

server.listen(port, () => {
  console.log(`Sorryometer listening on http://localhost:${port}`);
});
