import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { mkdirSync, rmSync, existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { readConfig, writeConfig } from "../src/config"
import type { OpenChannelsConfig } from "../src/types"

const TMPDIR = join(import.meta.dir, "__tmp_config_test__")

beforeEach(() => {
  mkdirSync(TMPDIR, { recursive: true })
})

afterEach(() => {
  rmSync(TMPDIR, { recursive: true, force: true })
})

describe("readConfig", () => {
  test("returns null when config file does not exist", () => {
    const result = readConfig(TMPDIR)
    expect(result).toBeNull()
  })

  test("returns parsed config after writeConfig", () => {
    const config: OpenChannelsConfig = {
      botToken: "test-token",
      channelId: "123456",
    }
    writeConfig(TMPDIR, config)

    const result = readConfig(TMPDIR)
    expect(result).toEqual(config)
  })
})

describe("writeConfig", () => {
  test("creates .opencode dir and writes file", () => {
    const config: OpenChannelsConfig = {
      botToken: "token-abc",
      channelId: "789",
    }

    writeConfig(TMPDIR, config)

    const filePath = join(TMPDIR, ".opencode", "opencode-link.json")
    expect(existsSync(filePath)).toBe(true)
    expect(JSON.parse(readFileSync(filePath, "utf-8"))).toEqual(config)
  })

  test("overwrites existing config", () => {
    const config1: OpenChannelsConfig = {
      botToken: "old",
      channelId: "111",
    }
    const config2: OpenChannelsConfig = {
      botToken: "new",
      channelId: "222",
    }

    writeConfig(TMPDIR, config1)
    writeConfig(TMPDIR, config2)

    expect(readConfig(TMPDIR)).toEqual(config2)
  })
})
