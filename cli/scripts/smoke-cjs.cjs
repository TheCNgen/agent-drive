const assert = require("node:assert/strict");
const { AgentDrive, AgentDriveError } = require("../dist/index.cjs");

// No network, no config file: constructing AgentDrive must not perform I/O.
const client = new AgentDrive({ apiKey: "cdk_test_x", baseUrl: "http://localhost:1" });
assert.equal(typeof client.agent.me, "function");
assert.ok(AgentDriveError.prototype instanceof Error);

console.log("smoke-cjs: ok");
