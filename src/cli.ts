#!/usr/bin/env node
import { main } from "./server.js";

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
