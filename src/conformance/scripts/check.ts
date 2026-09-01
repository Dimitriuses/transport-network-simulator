// Check a player against the contract.
//
//   npm run conformance -- http://127.0.0.1:8080
//
// Run this before a scored run. It checks the interface, not the quality.

import { checkPlayer, renderConformance } from "../src/index.ts";

const baseUrl = process.argv[2] ?? process.env["TNS_PLAYER_URL"] ?? "http://127.0.0.1:8080";
const report = await checkPlayer(baseUrl);
console.log(renderConformance(report));
process.exit(report.ready ? 0 : 1);
