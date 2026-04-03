export function select(title, items) {
  return new Promise((resolve) => {
    if (!process.stdin.isTTY) {
      console.log(`${title}`)
      items.forEach((item, i) => console.log(`  ${i + 1}) ${item}`))
      import("node:readline").then(({ createInterface }) => {
        const rl = createInterface({ input: process.stdin, output: process.stdout })
        rl.question("  Select [1]: ", (answer) => {
          rl.close()
          const idx = parseInt(answer.trim()) - 1
          resolve(idx >= 0 && idx < items.length ? idx : 0)
        })
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

    const onData = (buf) => {
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

export function ask(question) {
  return new Promise((resolve) => {
    import("node:readline").then(({ createInterface }) => {
      const rl = createInterface({ input: process.stdin, output: process.stdout })
      rl.question(question, (answer) => { rl.close(); resolve(answer.trim()) })
    })
  })
}
