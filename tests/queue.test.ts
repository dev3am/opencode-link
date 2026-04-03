import { describe, test, expect } from "bun:test"
import { MessageQueue } from "../src/queue"

describe("MessageQueue", () => {
  test("processes enqueued message immediately", async () => {
    const q = new MessageQueue<{ id: number }>()
    const processed: number[] = []

    q.setProcessor(async (msg) => {
      processed.push(msg.id)
    })

    q.enqueue({ id: 1 })
    await q.idle()

    expect(processed).toEqual([1])
  })

  test("processes messages in FIFO order", async () => {
    const q = new MessageQueue<{ id: number }>()
    const processed: number[] = []

    q.setProcessor(async (msg) => {
      processed.push(msg.id)
    })

    q.enqueue({ id: 1 })
    q.enqueue({ id: 2 })
    q.enqueue({ id: 3 })
    await q.idle()

    expect(processed).toEqual([1, 2, 3])
  })

  test("continues after processor error", async () => {
    const q = new MessageQueue<{ id: number }>()
    const processed: number[] = []

    q.setProcessor(async (msg) => {
      if (msg.id === 2) throw new Error("fail")
      processed.push(msg.id)
    })

    q.enqueue({ id: 1 })
    q.enqueue({ id: 2 })
    q.enqueue({ id: 3 })
    await q.idle()

    expect(processed).toEqual([1, 3])
  })

  test("queues messages while processing", async () => {
    const q = new MessageQueue<{ id: number }>()
    const order: string[] = []

    let resolveFirst: () => void
    const firstPromise = new Promise<void>((r) => { resolveFirst = r })

    q.setProcessor(async (msg) => {
      order.push(`start:${msg.id}`)
      if (msg.id === 1) await firstPromise
      order.push(`end:${msg.id}`)
    })

    q.enqueue({ id: 1 })
    await new Promise((r) => setTimeout(r, 10))

    expect(q.isProcessing).toBe(true)
    q.enqueue({ id: 2 })
    q.enqueue({ id: 3 })

    resolveFirst!()
    await q.idle()

    expect(order).toEqual([
      "start:1", "end:1",
      "start:2", "end:2",
      "start:3", "end:3",
    ])
  })

  test("reports pending count", async () => {
    const q = new MessageQueue<{ id: number }>()
    let resolveBlock: () => void
    const block = new Promise<void>((r) => { resolveBlock = r })

    q.setProcessor(async () => { await block })

    q.enqueue({ id: 1 })
    q.enqueue({ id: 2 })
    q.enqueue({ id: 3 })
    await new Promise((r) => setTimeout(r, 10))

    expect(q.pendingCount).toBe(2)

    resolveBlock!()
    await q.idle()
  })

  test("no processor set — enqueue without error", () => {
    const q = new MessageQueue<{ id: number }>()
    expect(() => q.enqueue({ id: 1 })).not.toThrow()
  })
})
