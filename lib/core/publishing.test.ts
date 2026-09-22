import { describe, expect, it } from "vitest"

import {
  contentTypeFor,
  exportFileName,
  isPublishable,
  PUBLISH_LIMITS,
  publishedPath,
  resolveRequestedPath,
  selectPublishFiles,
} from "./publishing"

describe("contentTypeFor", () => {
  it("serves web files with the right type", () => {
    expect(contentTypeFor("index.html")).toContain("text/html")
    expect(contentTypeFor("styles/base.css")).toContain("text/css")
    expect(contentTypeFor("src/main.js")).toContain("text/javascript")
    expect(contentTypeFor("art.svg")).toBe("image/svg+xml")
  })

  it("does not guess at unknown types", () => {
    expect(contentTypeFor("mystery.bin")).toBe("application/octet-stream")
  })
})

describe("isPublishable", () => {
  it("publishes the site files", () => {
    expect(isPublishable("index.html")).toBe(true)
    expect(isPublishable("src/player.js")).toBe(true)
  })

  it("never publishes tests, dependencies or dotfiles", () => {
    expect(isPublishable("tests/test_t1.js")).toBe(false)
    expect(isPublishable("node_modules/phaser/index.js")).toBe(false)
    expect(isPublishable(".env")).toBe(false)
    expect(isPublishable(".git/config")).toBe(false)
  })

  it("rejects escapes and absolute paths", () => {
    expect(isPublishable("../secret.html")).toBe(false)
    expect(isPublishable("/etc/passwd")).toBe(false)
    expect(isPublishable("a\0b.html")).toBe(false)
  })
})

describe("selectPublishFiles", () => {
  it("keeps web files and reports the rest as skipped", () => {
    const result = selectPublishFiles([
      { path: "index.html", content: "<h1>hi</h1>" },
      { path: "./src/main.js", content: "console.log(1)" },
      { path: "tests/test_t1.js", content: "" },
    ])
    expect(result.files.map((f) => f.path)).toEqual([
      "index.html",
      "src/main.js",
    ])
    expect(result.skipped).toEqual(["tests/test_t1.js"])
    expect(result.problem).toBeNull()
  })

  it("refuses to publish without an index page", () => {
    const result = selectPublishFiles([{ path: "src/main.js", content: "x" }])
    expect(result.problem).toMatch(/index\.html/)
  })

  it("explains an empty project in kid language", () => {
    expect(selectPublishFiles([]).problem).toMatch(/press GO/i)
  })

  it("drops a file that is too big to be hand-written code", () => {
    const huge = "x".repeat(PUBLISH_LIMITS.maxFileBytes + 1)
    const result = selectPublishFiles([
      { path: "index.html", content: "<h1>hi</h1>" },
      { path: "big.js", content: huge },
    ])
    expect(result.files.map((f) => f.path)).toEqual(["index.html"])
    expect(result.skipped).toContain("big.js")
  })
})

describe("published paths", () => {
  it("round-trips a request back to a stored file", () => {
    const url = publishedPath("proj1", "src/main.js")
    expect(url).toBe("/p/proj1/src/main.js")
    expect(resolveRequestedPath(url, "proj1")).toBe("src/main.js")
  })

  it("serves index.html for the bare project root", () => {
    expect(resolveRequestedPath("/p/proj1/", "proj1")).toBe("index.html")
  })

  it("refuses a traversal attempt in the URL", () => {
    expect(
      resolveRequestedPath("/p/proj1/../../etc/passwd", "proj1")
    ).toBeNull()
    expect(
      resolveRequestedPath("/p/proj1/%2e%2e%2fsecret.html", "proj1")
    ).toBeNull()
  })

  it("refuses a path for a different project", () => {
    expect(resolveRequestedPath("/p/other/index.html", "proj1")).toBeNull()
  })
})

describe("exportFileName", () => {
  it("makes a safe download name", () => {
    expect(exportFileName("My Space Dodge!")).toBe("my-space-dodge.zip")
    expect(exportFileName("")).toBe("my-project.zip")
    expect(exportFileName("../../etc")).toBe("etc.zip")
  })
})
