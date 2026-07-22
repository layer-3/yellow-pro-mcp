#!/usr/bin/env node
import { main } from "./server.js";
import { VERSION } from "./version.js";

if (process.argv.includes("--version") || process.argv.includes("-v")) {
  console.log(VERSION);
  process.exit(0);
}
if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(`yellow-pro-mcp ${VERSION}
Model Context Protocol server for the yellow_pro exchange.
`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
