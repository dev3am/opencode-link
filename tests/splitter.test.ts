import { describe, test, expect } from "bun:test"
import { splitMessage } from "../src/splitter"

describe("splitMessage", () => {
  test("returns single chunk for short message", () => {
    const result = splitMessage("Hello world")
    expect(result).toEqual(["Hello world"])
  })

  test("returns single chunk for exactly 2000 chars", () => {
    const text = "a".repeat(2000)
    const result = splitMessage(text)
    expect(result).toEqual([text])
    expect(result[0].length).toBe(2000)
  })

  test("splits message over 2000 chars by newlines", () => {
    const text = "a".repeat(1500) + "\n" + "b".repeat(1500)
    const result = splitMessage(text)
    expect(result.length).toBe(2)
    expect(result[0]).toBe("a".repeat(1500))
    expect(result[1]).toBe("b".repeat(1500))
  })

  test("preserves code block as split boundary", () => {
    const code = "```js\n" + "x = 1\n".repeat(300) + "```"
    const before = "Some text before\n\n"
    const after = "\nSome text after"
    const text = before + code + after
    const result = splitMessage(text)
    for (const chunk of result) {
      expect(chunk.length).toBeLessThanOrEqual(2000)
    }
  })

  test("splits oversized code block by newlines", () => {
    const lines = Array.from({ length: 300 }, (_, i) => `line ${i}`)
    const code = "```\n" + lines.join("\n") + "\n```"
    const result = splitMessage(code)
    expect(result.length).toBeGreaterThan(1)
    for (const chunk of result) {
      expect(chunk.length).toBeLessThanOrEqual(2000)
    }
  })

  test("splits at header boundaries", () => {
    const para1 = "a".repeat(1200)
    const para2 = "# Header\n" + "b".repeat(1200)
    const text = para1 + "\n\n" + para2
    const result = splitMessage(text)
    expect(result.length).toBe(2)
    expect(result[0]).toBe(para1)
    expect(result[1]).toBe(para2)
  })

  test("handles very long single line with hard break", () => {
    const text = "a".repeat(4000)
    const result = splitMessage(text)
    expect(result.length).toBe(2)
    expect(result[0].length).toBe(2000)
    expect(result[1].length).toBe(2000)
  })

  test("empty string returns empty array", () => {
    const result = splitMessage("")
    expect(result).toEqual([])
  })

  test("merges small blocks into single chunk", () => {
    const blocks = ["short1", "short2", "short3"].join("\n\n")
    const result = splitMessage(blocks)
    expect(result).toEqual([blocks])
  })

  test("respects custom maxLength", () => {
    const text = "a".repeat(300) + "\n" + "b".repeat(300)
    const result = splitMessage(text, 500)
    expect(result.length).toBe(2)
    expect(result[0]).toBe("a".repeat(300))
    expect(result[1]).toBe("b".repeat(300))
  })

  test("Telegram maxLength (4096)", () => {
    const text = "a".repeat(3000) + "\n" + "b".repeat(3000)
    const result = splitMessage(text, 4096)
    expect(result.length).toBe(2)
    for (const chunk of result) {
      expect(chunk.length).toBeLessThanOrEqual(4096)
    }
  })

  test("Slack maxLength (40000)", () => {
    const text = "a".repeat(25000) + "\n" + "b".repeat(25000)
    const result = splitMessage(text, 40000)
    expect(result.length).toBe(2)
    for (const chunk of result) {
      expect(chunk.length).toBeLessThanOrEqual(40000)
    }
  })
})
