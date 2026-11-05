import { createWriteStream, type WriteStream } from 'node:fs'
import { readdir, readFile, stat } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i += 1) {
    let value = i
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
    }
    table[i] = value >>> 0
  }
  return table
})()

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff
  for (let i = 0; i < buffer.length; i += 1) {
    crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

interface ZipEntry {
  name: Buffer
  crc: number
  size: number
  offset: number
  time: number
  date: number
}

function dosTime(date: Date): { time: number; date: number } {
  const time =
    (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2)
  const day =
    ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  return { time, date: day }
}

async function collectFiles(
  root: string,
  dir: string,
  ignore: Set<string>,
  out: string[]
): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    if (ignore.has(entry.name)) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      await collectFiles(root, full, ignore, out)
    } else if (entry.isFile()) {
      out.push(relative(root, full))
    }
  }
}

function writeChunk(stream: WriteStream, chunk: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error): void => {
      stream.off('error', onError)
      reject(error)
    }
    stream.once('error', onError)
    stream.write(chunk, () => {
      stream.off('error', onError)
      resolve()
    })
  })
}

export async function zipDirectory(
  sourceDir: string,
  targetFile: string,
  options: { rootName: string; ignore?: string[] }
): Promise<void> {
  const ignore = new Set(options.ignore ?? [])
  const files: string[] = []
  await collectFiles(sourceDir, sourceDir, ignore, files)
  files.sort()

  const stream = createWriteStream(targetFile)
  const entries: ZipEntry[] = []
  let offset = 0

  for (const relPath of files) {
    const fullPath = join(sourceDir, relPath)
    const data = await readFile(fullPath)
    const info = await stat(fullPath)
    const { time, date } = dosTime(info.mtime)
    const name = Buffer.from(`${options.rootName}/${relPath.split(sep).join('/')}`, 'utf8')
    const crc = crc32(data)

    const header = Buffer.alloc(30)
    header.writeUInt32LE(0x04034b50, 0)
    header.writeUInt16LE(20, 4)
    header.writeUInt16LE(0x0800, 6)
    header.writeUInt16LE(0, 8)
    header.writeUInt16LE(time, 10)
    header.writeUInt16LE(date, 12)
    header.writeUInt32LE(crc, 14)
    header.writeUInt32LE(data.length, 18)
    header.writeUInt32LE(data.length, 22)
    header.writeUInt16LE(name.length, 26)
    header.writeUInt16LE(0, 28)

    await writeChunk(stream, header)
    await writeChunk(stream, name)
    await writeChunk(stream, data)

    entries.push({ name, crc, size: data.length, offset, time, date })
    offset += header.length + name.length + data.length
  }

  const centralOffset = offset
  for (const entry of entries) {
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(0x0800, 8)
    central.writeUInt16LE(0, 10)
    central.writeUInt16LE(entry.time, 12)
    central.writeUInt16LE(entry.date, 14)
    central.writeUInt32LE(entry.crc, 16)
    central.writeUInt32LE(entry.size, 20)
    central.writeUInt32LE(entry.size, 24)
    central.writeUInt16LE(entry.name.length, 28)
    central.writeUInt16LE(0, 30)
    central.writeUInt16LE(0, 32)
    central.writeUInt16LE(0, 34)
    central.writeUInt16LE(0, 36)
    central.writeUInt32LE(0, 38)
    central.writeUInt32LE(entry.offset, 42)

    await writeChunk(stream, central)
    await writeChunk(stream, entry.name)
    offset += central.length + entry.name.length
  }

  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(0, 4)
  end.writeUInt16LE(0, 6)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(offset - centralOffset, 12)
  end.writeUInt32LE(centralOffset, 16)
  end.writeUInt16LE(0, 20)

  await writeChunk(stream, end)
  await new Promise<void>((resolve, reject) => {
    stream.once('error', reject)
    stream.end(() => resolve())
  })
}
