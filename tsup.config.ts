import { defineConfig } from "tsup"

export default defineConfig({
  entry: {
    index: "src/index.ts",
    setup: "src/setup.ts",
  },
  format: ["esm"],
  dts: true,
  clean: true,
  noExternal: ["discord.js", "@slack/bolt", "@slack/web-api", "grammy"],
  external: ["@opencode-ai/plugin", "@opencode-ai/sdk", "ws"],
})
