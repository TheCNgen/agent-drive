const assert = require("node:assert/strict");
const { CashDrive, CashDriveError } = require("../dist/index.cjs");

// No network, no config file: constructing CashDrive must not perform I/O.
const client = new CashDrive({ apiKey: "cdk_test_x", baseUrl: "http://localhost:1" });
assert.equal(typeof client.agent.me, "function");
assert.ok(CashDriveError.prototype instanceof Error);

console.log("smoke-cjs: ok");
