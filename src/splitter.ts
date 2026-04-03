export function splitMessage(text: string, maxLength = 2000): string[] {
  if (!text) return []
  if (text.length <= maxLength) return [text]

  const blocks = splitByStructure(text)
  return mergeBlocks(blocks, maxLength)
}

function splitByStructure(text: string): string[] {
  const blocks: string[] = []
  const lines = text.split("\n")
  let current = ""
  let inCodeBlock = false

  for (const line of lines) {
    if (line.startsWith("```")) {
      if (inCodeBlock) {
        current += (current ? "\n" : "") + line
        blocks.push(current)
        current = ""
        inCodeBlock = false
      } else {
        if (current.trim()) blocks.push(current)
        current = line
        inCodeBlock = true
      }
    } else if (!inCodeBlock && /^#{1,6}\s/.test(line) && current.trim()) {
      blocks.push(current.replace(/\n+$/, ""))
      current = line
    } else {
      current += (current ? "\n" : "") + line
    }
  }

  if (current.trim()) blocks.push(current)
  return blocks
}

function mergeBlocks(blocks: string[], maxLength: number): string[] {
  const chunks: string[] = []
  let current = ""

  for (const block of blocks) {
    if (block.length > maxLength) {
      if (current) {
        chunks.push(current)
        current = ""
      }
      chunks.push(...splitOversizedBlock(block, maxLength))
    } else if ((current + "\n" + block).length > maxLength) {
      chunks.push(current)
      current = block
    } else {
      current = current ? current + "\n" + block : block
    }
  }

  if (current) chunks.push(current)
  return chunks
}

function splitOversizedBlock(text: string, maxLength: number): string[] {
  const lines = text.split("\n")
  const chunks: string[] = []
  let current = ""

  for (const line of lines) {
    if (line.length > maxLength) {
      if (current) {
        chunks.push(current)
        current = ""
      }
      chunks.push(...splitLongLine(line, maxLength))
    } else if ((current + "\n" + line).length > maxLength) {
      chunks.push(current)
      current = line
    } else {
      current = current ? current + "\n" + line : line
    }
  }

  if (current) chunks.push(current)
  return chunks
}

function splitLongLine(line: string, maxLength: number): string[] {
  const chunks: string[] = []
  for (let i = 0; i < line.length; i += maxLength) {
    chunks.push(line.slice(i, i + maxLength))
  }
  return chunks
}
