// The Atlas editor: a small local web app for linking phrases in the poem
// to references and editing the references themselves.
//
//   npm run editor               editor on http://localhost:4000, site preview on :8080
//   npm run editor -- --no-preview   editor only
//
// It only listens on this computer (127.0.0.1) and only writes Markdown files in
// content/poem and content/refs, the same files you would edit in Obsidian.

import http from "node:http"
import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { spawn, execFile } from "node:child_process"
import matter from "gray-matter"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const EDITOR = path.join(ROOT, "editor")
const CONTENT = path.join(ROOT, "content")
const POEM = path.join(CONTENT, "poem")
const REFS = path.join(CONTENT, "refs")
const PORT = Number(process.env.EDITOR_PORT ?? 4000)
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const WIKILINK = /\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g

// ── helpers ──────────────────────────────────────────────────────────────────

const mdFiles = async (dir) =>
  (await fs.readdir(dir))
    .filter((f) => f.endsWith(".md") && f !== "index.md")
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))

const json = (res, status, body) => {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" })
  res.end(JSON.stringify(body))
}

const readBody = (req) =>
  new Promise((resolve, reject) => {
    let data = ""
    req.on("data", (c) => {
      data += c
      if (data.length > 2_000_000) reject(new Error("request too large"))
    })
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {})
      } catch (e) {
        reject(e)
      }
    })
  })

const run = (cmd, args) =>
  new Promise((resolve) =>
    execFile(cmd, args, { cwd: ROOT }, (err, stdout, stderr) =>
      resolve({ ok: !err, output: (stdout + stderr).trim() }),
    ),
  )

// The poem text with link markup removed: used to make sure an edit to a line
// only ever adds, changes or removes links, never the words of the poem.
const plain = (line) =>
  line.replace(/\[\[[^\]|]*\|([^\]]*)\]\]/g, "$1").replace(/\[\[([^\]]*)\]\]/g, "$1")

function refToFile({ title, tags, body, extra }) {
  const data = { ...(extra ?? {}), title }
  const cleanTags = (tags ?? []).map((t) => String(t).trim()).filter(Boolean)
  if (cleanTags.length) data.tags = cleanTags
  let text = String(body ?? "").replace(/\r\n/g, "\n").trim()
  return matter.stringify("\n" + text + "\n", data)
}

// ── state ────────────────────────────────────────────────────────────────────

async function loadState() {
  const sections = []
  for (const file of await mdFiles(POEM)) {
    const raw = await fs.readFile(path.join(POEM, file), "utf8")
    const { data } = matter(raw)
    sections.push({ file, title: data.title ?? file, lines: raw.split("\n") })
  }

  const refs = []
  for (const file of await mdFiles(REFS)) {
    const raw = await fs.readFile(path.join(REFS, file), "utf8")
    const { data, content } = matter(raw)
    const { title, tags, ...extra } = data
    refs.push({
      slug: file.replace(/\.md$/, ""),
      title: title ?? file.replace(/\.md$/, ""),
      tags: Array.isArray(tags) ? tags : tags ? [tags] : [],
      body: content.trim(),
      extra,
      linksTo: [...content.matchAll(WIKILINK)].map((m) => m[1].trim()),
    })
  }

  // REFERENCES.md: "- “phrase” → `slug` **[?]**: one-line identification"
  const todo = []
  try {
    const raw = await fs.readFile(path.join(ROOT, "REFERENCES.md"), "utf8")
    let section = ""
    for (const line of raw.split("\n")) {
      const h = line.match(/^##\s+(.*)/)
      if (h) section = h[1].trim()
      const m = line.match(/^- (.+?) → `([a-z0-9-]+)`\s*(\*\*\[\?\]\*\*)?:?\s*(.*)$/)
      if (m) {
        todo.push({
          section,
          phrase: m[1].replace(/[“”"]/g, "").trim(),
          slug: m[2],
          uncertain: !!m[3],
          note: m[4].trim(),
        })
      }
    }
  } catch {
    // no to-do list: fine
  }

  return { sections, refs, todo }
}

// ── API ──────────────────────────────────────────────────────────────────────

// Only this editor's own page may use the API. Your browser runs on this computer too,
// so without these checks any website open in another tab could send requests here.
//  - Host must be localhost:PORT: blocks "DNS rebinding", where a website points its own
//    domain name at 127.0.0.1 to get around the browser's same-origin rules.
//  - Origin, if the browser sends one (all modern browsers do on POST/DELETE), must be
//    this editor's page.
//  - Changes must be sent as JSON. A cross-site JSON request triggers a CORS "preflight"
//    that this server never approves, so the browser blocks it before it's sent.
const ALLOWED_HOSTS = new Set([`localhost:${PORT}`, `127.0.0.1:${PORT}`])
const ALLOWED_ORIGINS = new Set([...ALLOWED_HOSTS].map((h) => `http://${h}`))

function trusted(req) {
  if (!ALLOWED_HOSTS.has(req.headers.host ?? "")) return false
  if (req.method === "GET") return true
  const origin = req.headers.origin
  if (origin !== undefined && !ALLOWED_ORIGINS.has(origin)) return false
  return (req.headers["content-type"] ?? "").startsWith("application/json") || req.method === "DELETE"
}

async function api(req, res, url) {
  if (!trusted(req)) return json(res, 403, { error: "Requests are only accepted from the editor’s own page." })
  if (req.method === "DELETE" && req.headers.origin === undefined)
    return json(res, 403, { error: "Requests are only accepted from the editor’s own page." })
  const route = `${req.method} ${url.pathname}`

  if (route === "GET /api/state") return json(res, 200, await loadState())

  // Replace one line of a poem section. The client sends the line as it saw it
  // (so edits made meanwhile in Obsidian aren't overwritten) and the new line,
  // which must read exactly the same once link markup is removed.
  if (route === "POST /api/poem-line") {
    const { file, index, expected, line } = await readBody(req)
    if (!/^[\w.-]+\.md$/.test(file ?? "")) return json(res, 400, { error: "bad file" })
    const full = path.join(POEM, file)
    const lines = (await fs.readFile(full, "utf8")).split("\n")
    if (lines[index] !== expected)
      return json(res, 409, { error: "That line changed on disk. The editor has reloaded it; try again." })
    if (line.includes("\n") || plain(line) !== plain(expected))
      return json(res, 400, { error: "Only links can be changed here, not the words of the poem." })
    lines[index] = line
    await fs.writeFile(full, lines.join("\n"))
    return json(res, 200, { ok: true })
  }

  // Create or update a reference.
  if (route === "POST /api/ref") {
    const { slug, title, tags, body, extra, create } = await readBody(req)
    if (!SLUG.test(slug ?? ""))
      return json(res, 400, { error: "The file name may only use lowercase letters, digits and hyphens." })
    if (!String(title ?? "").trim()) return json(res, 400, { error: "A reference needs a title." })
    const full = path.join(REFS, `${slug}.md`)
    const exists = await fs.access(full).then(
      () => true,
      () => false,
    )
    if (create && exists) return json(res, 409, { error: `A reference called “${slug}” already exists.` })
    if (!create && !exists) return json(res, 404, { error: `No reference called “${slug}”.` })
    await fs.writeFile(full, refToFile({ title: title.trim(), tags, body, extra }))
    return json(res, 200, { ok: true })
  }

  // Delete a reference, only if nothing links to it.
  if (req.method === "DELETE" && url.pathname.startsWith("/api/ref/")) {
    const slug = decodeURIComponent(url.pathname.slice("/api/ref/".length))
    if (!SLUG.test(slug)) return json(res, 400, { error: "bad name" })
    const state = await loadState()
    const used =
      state.sections.some((s) => s.lines.some((l) => [...l.matchAll(WIKILINK)].some((m) => m[1].trim() === slug))) ||
      state.refs.some((r) => r.linksTo.includes(slug))
    if (used) return json(res, 409, { error: "Remove the links to this reference first." })
    await fs.unlink(path.join(REFS, `${slug}.md`))
    return json(res, 200, { ok: true })
  }

  // Publishing: show what changed, then commit and push.
  if (route === "GET /api/changes") {
    const r = await run("git", ["status", "--porcelain", "--", "content", "REFERENCES.md"])
    return json(res, 200, { ok: r.ok, changes: r.output ? r.output.split("\n") : [], output: r.output })
  }
  if (route === "POST /api/publish") {
    const { message } = await readBody(req)
    const msg = String(message ?? "").trim() || "Update the atlas"
    const steps = [
      ["git", ["add", "--", "content", "REFERENCES.md"]],
      // only ever commits the content, even if other files happen to be staged
      ["git", ["commit", "-m", msg, "--", "content", "REFERENCES.md"]],
      ["git", ["push"]],
    ]
    let log = ""
    for (const [cmd, args] of steps) {
      const r = await run(cmd, args)
      log += `$ ${cmd} ${args.join(" ")}\n${r.output}\n\n`
      if (!r.ok) return json(res, 500, { error: "Publishing stopped at this step.", output: log })
    }
    return json(res, 200, { ok: true, output: log })
  }

  return json(res, 404, { error: "not found" })
}

// ── server ───────────────────────────────────────────────────────────────────

const STATIC = {
  "/": ["index.html", "text/html"],
  "/app.js": ["app.js", "text/javascript"],
  "/style.css": ["style.css", "text/css"],
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost")
  // don't let other sites embed the editor in a frame (click-jacking)
  res.setHeader("x-frame-options", "DENY")
  res.setHeader("content-security-policy", "default-src 'self'; frame-ancestors 'none'")
  try {
    if (url.pathname.startsWith("/api/")) return await api(req, res, url)
    const file = STATIC[url.pathname]
    if (!file) return json(res, 404, { error: "not found" })
    res.writeHead(200, { "content-type": `${file[1]}; charset=utf-8`, "cache-control": "no-store" })
    res.end(await fs.readFile(path.join(EDITOR, file[0])))
  } catch (e) {
    json(res, 500, { error: String(e?.message ?? e) })
  }
})

server.listen(PORT, "127.0.0.1", () => {
  console.log(`\n  Atlas editor:  http://localhost:${PORT}`)
})

let preview
if (!process.argv.includes("--no-preview")) {
  preview = spawn("npx", ["quartz", "build", "--serve"], { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] })
  let announced = false
  const watch = (chunk) => {
    if (!announced && /listening at/.test(String(chunk))) {
      announced = true
      console.log("  Site preview:  http://localhost:8080  (rebuilds whenever you save)\n")
    }
  }
  preview.stdout.on("data", watch)
  preview.stderr.on("data", watch)
}

for (const sig of ["SIGINT", "SIGTERM"])
  process.on(sig, () => {
    preview?.kill()
    process.exit(0)
  })
