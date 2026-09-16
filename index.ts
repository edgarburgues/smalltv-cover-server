import { createCoverHandler } from "./src/cover";
import { createCoverSource } from "./src/source";

const load = createCoverSource();
const server = Bun.serve({ hostname: process.env.HOST || "0.0.0.0", port: Number(process.env.PORT || 3000),
  idleTimeout: 60, fetch: createCoverHandler(load) });
console.log("SmallTV cover server listening on port " + server.port);
