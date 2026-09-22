import { describe, expect, it } from "vitest"

import { buildZip, crc32, safeEntryName } from "./zip"

const u32 = (bytes: Uint8Array, at: number): number =>
  (bytes[at] |
    (bytes[at + 1] << 8) |
    (bytes[at + 2] << 16) |
    (bytes[at + 3] << 24)) >>>
  0

const u16 = (bytes: Uint8Array, at: number): number =>
  bytes[at] | (bytes[at + 1] << 8)

describe("crc32", () => {
  it("matches the known CRC-32 of 'hello'", () => {
    expect(crc32(new TextEncoder().encode("hello"))).toBe(0x3610a686)
  })

  it("is zero for empty input", () => {
    expect(crc32(new Uint8Array())).toBe(0)
  })
})

describe("safeEntryName", () => {
  it("normalises separators and strips leading slashes", () => {
    expect(safeEntryName("src\\main.js")).toBe("src/main.js")
    expect(safeEntryName("/index.html")).toBe("index.html")
    expect(safeEntryName("./a/./b.js")).toBe("a/b.js")
  })

  it("refuses an entry that would escape the extraction folder", () => {
    expect(safeEntryName("../evil.js")).toBeNull()
    expect(safeEntryName("a/../../evil.js")).toBeNull()
    expect(safeEntryName("")).toBeNull()
  })
})

describe("buildZip", () => {
  const files = [
    { path: "index.html", content: "<h1>hi</h1>" },
    { path: "src/main.js", content: "console.log('go')" },
  ]

  it("writes a local header per file and an end-of-central-directory record", () => {
    const zip = buildZip(files)

    expect(u32(zip, 0)).toBe(0x04034b50) // first local file header

    // End of central directory sits at the very end (no archive comment).
    const eocd = zip.length - 22
    expect(u32(zip, eocd)).toBe(0x06054b50)
    expect(u16(zip, eocd + 8)).toBe(2) // entries on this disk
    expect(u16(zip, eocd + 10)).toBe(2) // total entries

    const centralSize = u32(zip, eocd + 12)
    const centralOffset = u32(zip, eocd + 16)
    expect(centralOffset + centralSize).toBe(eocd)
    expect(u32(zip, centralOffset)).toBe(0x02014b50) // central directory header
  })

  it("stores content uncompressed with a matching CRC", () => {
    const zip = buildZip([files[0]])
    const data = new TextEncoder().encode(files[0].content)

    expect(u16(zip, 8)).toBe(0) // compression method: stored
    expect(u32(zip, 14)).toBe(crc32(data))
    expect(u32(zip, 18)).toBe(data.length) // compressed size
    expect(u32(zip, 22)).toBe(data.length) // uncompressed size

    const nameLen = u16(zip, 26)
    const name = new TextDecoder().decode(zip.subarray(30, 30 + nameLen))
    expect(name).toBe("index.html")

    const body = new TextDecoder().decode(
      zip.subarray(30 + nameLen, 30 + nameLen + data.length)
    )
    expect(body).toBe(files[0].content)
  })

  it("marks filenames as UTF-8", () => {
    const zip = buildZip([{ path: "héllo.html", content: "x" }])
    expect(u16(zip, 6) & 0x0800).toBe(0x0800)
  })

  it("is deterministic, so the same project exports the same bytes", () => {
    expect(Array.from(buildZip(files))).toEqual(Array.from(buildZip(files)))
  })

  it("skips entries that would escape the extraction folder", () => {
    const zip = buildZip([{ path: "../evil.js", content: "x" }])
    const eocd = zip.length - 22
    expect(u16(zip, eocd + 10)).toBe(0)
  })

  it("handles an empty archive", () => {
    const zip = buildZip([])
    expect(zip.length).toBe(22)
    expect(u32(zip, 0)).toBe(0x06054b50)
  })
})
