import { defineConfig } from "tsup";

export default defineConfig({
  entry: { index: "src/index.ts", agent: "src/agent.ts", cli: "src/cli.ts" },
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  sourcemap: true,
  treeshake: true,
  target: "node20",
  outExtension: ({ format }) => ({ js: format === "cjs" ? ".cjs" : ".js" }),
});
