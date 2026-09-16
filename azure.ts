import { createServer } from "node:http";
import { createCoverHandler } from "./src/cover";
import { createCoverSource } from "./src/source";

const handle = createCoverHandler(createCoverSource());
const server = createServer(async (incoming, outgoing) => {
  try {
    // Only GET endpoints are accepted; no incoming request body is needed.
    const headers = new Headers();
    const etag = incoming.headers["if-none-match"];
    if (typeof etag === "string") headers.set("If-None-Match", etag);
    const request = new Request(new URL(incoming.url || "/", "http://localhost").href, {
      method: incoming.method || "GET", headers,
    });
    const response = await handle(request);
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch {
    console.error("Request failed");
    if (!outgoing.headersSent) outgoing.writeHead(500);
    outgoing.end();
  }
});
server.listen(Number(process.env.PORT || 3000), process.env.HOST || "0.0.0.0", () => {
  console.log("SmallTV cover server ready");
});
process.on("SIGTERM", () => server.close());
