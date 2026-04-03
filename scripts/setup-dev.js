import { existsSync, mkdirSync, cpSync, unlinkSync, writeFileSync, readFileSync, readdirSync } from "node:fs"
import { resolve, join } from "node:path"
import { execSync } from "node:child_process"
import { select, ask } from "./prompt.js"

const root = resolve(import.meta.dirname, "..")
const opencodeDir = join(root, ".opencode")
const pluginsDir = join(opencodeDir, "plugins")
const distDir = join(root, "dist")
const configPath = join(opencodeDir, "opencode-link.json")
const ocJsonPath = join(root, "opencode.json")
const localPluginDir = join(pluginsDir, "opencode-link")

const PROVIDERS = [
  { name: "Discord", value: "discord" },
  { name: "Slack", value: "slack" },
  { name: "Telegram", value: "telegram" },
]

function getArg(name) {
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3)
}

function copyPluginFiles() {
  if (existsSync(localPluginDir)) {
    for (const f of readdirSync(localPluginDir)) unlinkSync(join(localPluginDir, f))
  } else {
    mkdirSync(localPluginDir, { recursive: true })
  }
  for (const f of readdirSync(distDir)) {
    if (f.endsWith(".js")) {
      cpSync(join(distDir, f), join(localPluginDir, f))
    }
  }
  writeFileSync(
    join(localPluginDir, "package.json"),
    JSON.stringify({ name: "opencode-link", type: "module", main: "index.js", exports: { "./server": "./index.js" } }, null, 2) + "\n",
  )
}

if (!existsSync(distDir) || !readdirSync(distDir).some((f) => f === "index.js")) {
  console.log("Building first...")
  execSync("npm run build", { cwd: root, stdio: "inherit" })
}

copyPluginFiles()
console.log("  Copied dist/*.js -> .opencode/plugins/opencode-link/")

if (!existsSync(configPath)) {
  console.log(`\n  \x1B[1m\x1B[36mConfigure opencode-link\x1B[0m\n`)

  const providerArg = getArg("provider")
  let providerIdx = providerArg
    ? PROVIDERS.findIndex((p) => p.value === providerArg)
    : await select("Select a messaging provider:", PROVIDERS.map((p) => p.name))

  if (providerIdx < 0 || providerIdx >= PROVIDERS.length) {
    console.error(`  Error: Unknown provider "${providerArg}"`)
    process.exit(1)
  }

  const provider = PROVIDERS[providerIdx]

  if (provider.value === "discord") {
    const token = getArg("token") || await ask("  Bot Token: ")
    const channel = getArg("channel") || await ask("  Channel ID: ")

    if (!token || !channel) {
      console.error("  Error: Token and Channel ID are required")
      process.exit(1)
    }

    writeFileSync(configPath, JSON.stringify({
      provider: provider.value,
      botToken: token,
      channelId: channel,
    }, null, 2) + "\n")
    console.log(`\n  \x1B[32m✓\x1B[0m Created: ${configPath}`)
  }
} else {
  console.log(`  Exists: ${configPath}`)
}

let ocJson = {}
if (existsSync(ocJsonPath)) {
  ocJson = JSON.parse(readFileSync(ocJsonPath, "utf-8"))
}
if (!ocJson.plugin) ocJson.plugin = []
const pluginPath = "./.opencode/plugins/opencode-link"
if (!ocJson.plugin.includes(pluginPath) && !ocJson.plugin.includes("opencode-link")) {
  ocJson.plugin.push(pluginPath)
  writeFileSync(ocJsonPath, JSON.stringify(ocJson, null, 2) + "\n")
  console.log(`  \x1B[32m✓\x1B[0m Updated opencode.json`)
}

console.log(`\n  Dev setup complete! Run \`npm run dev\` for watch mode, then start opencode.`)
