/**
 * Write the OpenAPI document where `scripts/generate-openapi.sh` says.
 *
 * The destination is an argument rather than a constant so that importing this
 * module can never write anything: it is a program, and the only thing that
 * runs it is that script.
 */
import { writeFileSync } from "node:fs";

import { renderOpenApiDocument } from "./openapi.js";

const destination = process.argv[2];
if (destination === undefined) {
  process.stderr.write("usage: write-openapi <destination>\n");
  process.exit(2);
}

writeFileSync(destination, renderOpenApiDocument());
process.stdout.write(`${destination} is what the contract schemas render.\n`);
