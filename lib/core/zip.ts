/**
 * A tiny ZIP writer, so "download my project" needs no dependency.
 *
 * Entries are STORED (uncompressed). A kid's project is a handful of small text
 * files, so compression would save kilobytes and cost a dependency plus a
 * platform assumption — Convex actions and the browser do not share a zlib.
 *
 * Deterministic on purpose: a fixed DOS timestamp means the same files always
 * produce the same bytes, which is what makes this testable.
 *
 * Pure module. Output is a `Uint8Array` ready for a `Blob` or a `Response`.
 */

export interface ZipEntry {
  path: string
  content: string
}

/* ── CRC-32 (IEEE 802.3), the one ZIP wants ─────────────────────────────── */

let table: Uint32Array | null = null

function crcTable(): Uint32Array {
  if (table) return table
  const t = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    t[i] = c >>> 0
  }
  table = t
  return t
}

export function crc32(bytes: Uint8Array): number {
  const t = crcTable()
  let crc = 0xffffffff
  for (let i = 0; i < bytes.length; i++) {
    crc = t[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

/* ── Byte sink ──────────────────────────────────────────────────────────── */

class Bytes {
  private buf = new Uint8Array(1024)
  private len = 0

  get length(): number {
    return this.len
  }

  private grow(extra: number): void {
    if (this.len + extra <= this.buf.length) return
    let size = this.buf.length * 2
    while (size < this.len + extra) size *= 2
    const next = new Uint8Array(size)
    next.set(this.buf.subarray(0, this.len))
    this.buf = next
  }
  u16(value: number): void {
    this.grow(2)
    this.buf[this.len++] = value & 0xff
    this.buf[this.len++] = (value >>> 8) & 0xff
  }

  u32(value: number): void {
    this.grow(4)
    this.buf[this.len++] = value & 0xff
    this.buf[this.len++] = (value >>> 8) & 0xff
    this.buf[this.len++] = (value >>> 16) & 0xff
    this.buf[this.len++] = (value >>> 24) & 0xff
  }

  raw(bytes: Uint8Array): void {
    this.grow(bytes.length)
    this.buf.set(bytes, this.len)
    this.len += bytes.length
  }

  done(): Uint8Array<ArrayBuffer> {
    return this.buf.slice(0, this.len)
  }
}

const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text)

/** 1980-01-01 00:00, the earliest timestamp the DOS format can express. */
const DOS_TIME = 0
const DOS_DATE = 0x0021

/** Bit 11 tells the reader the filename is UTF-8. */
const FLAG_UTF8 = 0x0800
const METHOD_STORED = 0
const VERSION = 20

/**
 * Build a zip archive.
 *
 * Paths are normalised to forward slashes and stripped of leading slashes and
 * `..` segments — a zip entry called `../../x` is a real attack on whatever
 * unpacks it, and the export is a file a grown-up will open.
 *
 * The return type names its backing buffer so the bytes can go straight into a
 * `Response` or a `Blob` without a cast.
 */
export function buildZip(
  entries: readonly ZipEntry[]
): Uint8Array<ArrayBuffer> {
  const out = new Bytes()
  const central: {
    name: Uint8Array
    crc: number
    size: number
    offset: number
  }[] = []

  for (const entry of entries) {
    const name = safeEntryName(entry.path)
    if (!name) continue

    const nameBytes = utf8(name)
    const data = utf8(entry.content)
    const crc = crc32(data)
    const offset = out.length

    out.u32(0x04034b50) // local file header
    out.u16(VERSION)
    out.u16(FLAG_UTF8)
    out.u16(METHOD_STORED)
    out.u16(DOS_TIME)
    out.u16(DOS_DATE)
    out.u32(crc)
    out.u32(data.length) // compressed size == uncompressed, STORED
    out.u32(data.length)
    out.u16(nameBytes.length)
    out.u16(0) // no extra field
    out.raw(nameBytes)
    out.raw(data)

    central.push({ name: nameBytes, crc, size: data.length, offset })
  }

  const centralStart = out.length
  for (const item of central) {
    out.u32(0x02014b50) // central directory header
    out.u16(VERSION) // version made by
    out.u16(VERSION) // version needed
    out.u16(FLAG_UTF8)
    out.u16(METHOD_STORED)
    out.u16(DOS_TIME)
    out.u16(DOS_DATE)
    out.u32(item.crc)
    out.u32(item.size)
    out.u32(item.size)
    out.u16(item.name.length)
    out.u16(0) // extra
    out.u16(0) // comment
    out.u16(0) // disk number
    out.u16(0) // internal attributes
    out.u32(0o100644 << 16) // external attributes: regular file, rw-r--r--
    out.u32(item.offset)
    out.raw(item.name)
  }
  const centralSize = out.length - centralStart

  out.u32(0x06054b50) // end of central directory
  out.u16(0)
  out.u16(0)
  out.u16(central.length)
  out.u16(central.length)
  out.u32(centralSize)
  out.u32(centralStart)
  out.u16(0) // no archive comment

  return out.done()
}

/** Reject anything that would write outside the extraction folder. */
export function safeEntryName(path: string): string | null {
  const unified = String(path ?? "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .trim()
  if (!unified || unified.includes("\0")) return null
  const segments: string[] = []
  for (const seg of unified.split("/")) {
    if (seg === "" || seg === ".") continue
    if (seg === "..") return null
    segments.push(seg)
  }
  return segments.length ? segments.join("/") : null
}
