#!/usr/bin/env node

import { createInterface } from "node:readline"
import { existsSync, readFileSync, writeFileSync, mkdirSync, cpSync, readdirSync } from "node:fs"
import { join, resolve } from "node:path"
import { writeConfig } from "./config"
import type { OpenChannelsConfig } from "./types"

const PROVIDERS = [
  { name: "Discord", value: "discord" },
  { name: "Slack", value: "slack" },
  { name: "Telegram", value: "telegram" },
]

function ask(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve) => {
    rl.question(question, (answer: string) => {
      rl.close()
      resolve(answer.trim())
    })
  })
}

function select(title: string, items: string[]): Promise<number> {
  return new Promise((resolve) => {
    if (!process.stdin.isTTY) {
      console.log(title)
      items.forEach((item, i) => console.log(`  ${i + 1}) ${item}`))
      ask("  Select [1]: ").then((answer) => {
        const idx = parseInt(answer) - 1
        resolve(idx >= 0 && idx < items.length ? idx : 0)
      })
      return
    }

    let selected = 0
    const rowCount = items.length + 1

    const render = () => {
      process.stdout.write("\x1B[?25l")
      process.stdout.write(`\x1B[${rowCount}A\x1B[J`)
      const lines = items.map((item, i) => {
        const marker = i === selected ? "\x1B[36m❯\x1B[0m" : " "
        const text = i === selected ? `\x1B[36m${item}\x1B[0m` : item
        return `  ${marker} ${text}`
      })
      process.stdout.write(`${title}\n${lines.join("\n")}`)
    }

    process.stdin.setRawMode(true)
    process.stdin.resume()
    process.stdout.write("\n".repeat(rowCount))
    render()

    const onData = (buf: Buffer) => {
      const key = buf.toString()
      if (key === "\x1B[A" || key === "k") {
        selected = (selected - 1 + items.length) % items.length
        render()
      } else if (key === "\x1B[B" || key === "j") {
        selected = (selected + 1) % items.length
        render()
      } else if (key === "\r" || key === "\n" || key === " ") {
        process.stdin.setRawMode(false)
        process.stdin.removeListener("data", onData)
        process.stdout.write("\x1B[?25h\n")
        resolve(selected)
      }
    }

    process.stdin.on("data", onData)
  })
}

function copyPluginFiles(cwd: string): void {
  const distDir = resolve(import.meta.dirname, "..")
  const pluginDir = join(cwd, ".opencode", "plugins", "opencode-link")

  if (!existsSync(pluginDir)) {
    mkdirSync(pluginDir, { recursive: true })
  }

  for (const f of readdirSync(distDir)) {
    if (f.endsWith(".js")) {
      cpSync(join(distDir, f), join(pluginDir, f))
    }
  }
}

async function main() {
  console.log("\x1B[1m\x1B[36mopencode-link\x1B[0m\n")

  const idx = await select("Select a messaging provider:", PROVIDERS.map((p) => p.name))
  const provider = PROVIDERS[idx].value

  console.log()

  const botToken = await ask(
    provider === "slack" ? "Bot Token (xoxb-...): " :
    provider === "telegram" ? "Bot Token (from @BotFather): " :
    "Bot Token: "
  )
  if (!botToken) {
    console.error("Error: Bot Token is required")
    process.exit(1)
  }

  let appToken: string | undefined
  if (provider === "slack") {
    appToken = await ask("App-Level Token (xapp-...): ")
    if (!appToken) {
      console.error("Error: App-Level Token is required for Slack")
      process.exit(1)
    }
  }

  const channelId = await ask(
    provider === "telegram" ? "Chat ID: " :
    "Channel ID: "
  )
  if (!channelId) {
    console.error("Error: Channel ID is required")
    process.exit(1)
  }

  const cwd = process.cwd()
  const config: OpenChannelsConfig = {
    provider: provider as any,
    botToken,
    appToken,
    channelId,
  }

  writeConfig(cwd, config)
  console.log(`\n  \x1B[32m✓\x1B[0m Created .opencode/opencode-link.json`)

  const opencodeDir = join(cwd, ".opencode")
  const pluginsDir = join(opencodeDir, "plugins", "opencode-link")
  if (!existsSync(pluginsDir)) mkdirSync(pluginsDir, { recursive: true })
  const distDir = import.meta.dirname
  for (const f of readdirSync(distDir)) {
    if (f.endsWith(".js") && f !== "setup.js") {
      cpSync(join(distDir, f), join(pluginsDir, f))
    }
  }
  writeFileSync(
    join(pluginsDir, "package.json"),
    JSON.stringify({
      name: "opencode-link",
      type: "module",
      main: "index.js",
      exports: { "./server": "./index.js" },
    }, null, 2) + "\n",
  )
  console.log(`  \x1B[32m✓\x1B[0m Copied plugin files to .opencode/plugins/opencode-link/`)

  const ocJsonPath = join(cwd, "opencode.json")
  let ocJson: Record<string, unknown> = {}
  if (existsSync(ocJsonPath)) {
    ocJson = JSON.parse(readFileSync(ocJsonPath, "utf-8"))
  }
  const plugins = ((ocJson.plugin as string[]) || [])
  const localPath = "./.opencode/plugins/opencode-link"
  if (!plugins.includes(localPath) && !plugins.includes("opencode-link")) {
    plugins.push(localPath)
  }
  ocJson.plugin = plugins
  writeFileSync(ocJsonPath, JSON.stringify(ocJson, null, 2) + "\n")
  console.log(`  \x1B[32m✓\x1B[0m Updated opencode.json`)

  if (provider === "slack") {
    console.log(`\n  \x1B[33m⚠\x1B[0m Slack: Create an /opencode slash command in your Slack App settings.`)
  }
  console.log(`\n  Setup complete! Start opencode to begin.`)
}

main().catch((err) => {
  process.stdout.write("\x1B[?25h")
  process.stdin.setRawMode?.(false)
  console.error("Setup failed:", err)
  process.exit(1)
})
