import assert from "node:assert/strict";
import { AgentDrive, AgentDriveError } from "../dist/index.js";

// No network, no config file: constructing AgentDrive must not perform I/O.
const client = new AgentDrive({ apiKey: "cdk_test_x", baseUrl: "http://localhost:1" });
assert.equal(typeof client.agent.me, "function");
assert.ok(AgentDriveError.prototype instanceof Error);

console.log("smoke-esm: ok");
