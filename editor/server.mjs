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
import { readFileSync, unlinkSync } from "node:fs"
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

// Git must never stop to ask a question: the editor has no way to answer it, so a
// login prompt would leave Publish hanging. With prompts off, git fails at once
// and the editor explains what to do.
const GIT_ENV = { ...process.env, GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "never", GIT_ASKPASS: "", SSH_ASKPASS: "" }

const run = (cmd, args) =>
  new Promise((resolve) => {
    const child = execFile(
      cmd,
      args,
      { cwd: ROOT, env: GIT_ENV, timeout: 120_000 },
      (err, stdout, stderr) =>
        resolve({ ok: !err, timedOut: !!err?.killed, output: (stdout + stderr).trim() }),
    )
    child.stdin?.end()
  })

const SIGN_IN_HELP = `GitHub needs you to sign in before the editor can publish.

In a terminal, run these two commands (once only):

  sudo apt install gh
  gh auth login

Choose GitHub.com, then HTTPS, answer Yes to "Authenticate Git with your GitHub
credentials", and pick "Login with a web browser". Then click Publish again.
Your changes are saved and committed; nothing is lost.`

// Turn git's messages into plain instructions.
function explain(output, timedOut) {
  if (timedOut) return "GitHub didn’t answer within two minutes. Check your internet connection and click Publish again."
  if (/could not read (Username|Password)|terminal prompts disabled|Authentication failed|Permission denied \(publickey\)|403/i.test(output))
    return SIGN_IN_HELP
  if (/Could not resolve host|unable to access|Connection timed out|Failed to connect/i.test(output))
    return "Couldn’t reach GitHub. Check your internet connection and click Publish again. Your changes are committed and will go up next time."
  return null
}

// The poem text with link markup removed: used to make sure an edit to a line
// only ever adds, changes or removes links, never the words of the poem.
const plain = (line) =>
  line.replace(/\[\[[^\]|]*\|([^\]]*)\]\]/g, "$1").replace(/\[\[([^\]]*)\]\]/g, "$1")

// A section's title line ("title: ..."), which may be quoted, and may contain links.
const TITLE = /^title:\s*(.*)$/
function unquote(v) {
  v = v.trim()
  if (v.startsWith('"') && v.endsWith('"'))
    try {
      return JSON.parse(v)
    } catch {
      return v.slice(1, -1)
    }
  if (v.startsWith("'") && v.endsWith("'")) return v.slice(1, -1).replace(/''/g, "'")
  return v
}
const titleText = (line) => unquote(line.match(TITLE)?.[1] ?? "")

// which line of a section file holds its title (inside the frontmatter), or -1
function titleLineIndex(lines) {
  if (lines[0] !== "---") return -1
  const end = lines.indexOf("---", 1)
  const i = lines.findIndex((l, n) => n > 0 && n < end && TITLE.test(l))
  return i
}

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
    const lines = raw.split("\n")
    const titleLine = titleLineIndex(lines)
    const title = titleLine === -1 ? file : plain(titleText(lines[titleLine]))
    sections.push({ file, title, titleLine, lines })
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
    const isTitle = index === titleLineIndex(lines)
    const words = (l) => (isTitle ? (TITLE.test(l) ? plain(titleText(l)) : null) : plain(l))
    if (line.includes("\n") || words(line) === null || words(line) !== words(expected))
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
    // commits made here but not yet sent to GitHub (e.g. after a failed publish)
    const ahead = await run("git", ["rev-list", "--count", "@{upstream}..HEAD"])
    const unpushed = ahead.ok ? Number(ahead.output) || 0 : 0
    return json(res, 200, { ok: r.ok, changes: r.output ? r.output.split("\n") : [], unpushed, output: r.output })
  }
  if (route === "POST /api/publish") {
    const { message } = await readBody(req)
    const msg = String(message ?? "").trim() || "Update the atlas"
    let log = ""
    const step = async (args) => {
      const r = await run("git", args)
      log += `$ git ${args.join(" ")}\n${r.output}\n\n`
      return r
    }
    const fail = (error) => json(res, 500, { error, output: log })

    // 1. git needs to know who is committing
    const name = await run("git", ["config", "user.name"])
    const email = await run("git", ["config", "user.email"])
    if (!name.output || !email.output)
      return fail(`Git doesn’t know who you are yet, so it can’t sign the commit.

In a terminal, run (once only, with your own name and email):

  git config --global user.name "Your Name"
  git config --global user.email "you@example.com"

Then click Publish again.`)

    // 2. commit the content (if there is anything new)
    let r = await step(["add", "--", "content", "REFERENCES.md"])
    if (!r.ok) return fail("Couldn’t prepare the changes.")
    const staged = await run("git", ["diff", "--cached", "--quiet", "--", "content", "REFERENCES.md"])
    if (!staged.ok) {
      // only ever commits the content, even if other files happen to be staged
      r = await step(["commit", "-m", msg, "--", "content", "REFERENCES.md"])
      if (!r.ok) return fail("Couldn’t commit the changes.")
    }

    // 3. bring in anything published from elsewhere (GitHub, another computer)
    r = await step(["pull", "--rebase", "--autostash"])
    if (!r.ok) {
      if (/CONFLICT|could not apply|Resolve all conflicts/i.test(r.output)) {
        await step(["rebase", "--abort"])
        return fail(`The same file was changed both here and on GitHub, so the two versions need
combining by hand. Nothing has been lost: your changes are committed on this
computer. Ask for help with "a rebase conflict" and mention the file named above.`)
      }
      return fail(explain(r.output, r.timedOut) ?? "Couldn’t download the latest version from GitHub.")
    }

    // 4. send it up
    r = await step(["push"])
    if (!r.ok) return fail(explain(r.output, r.timedOut) ?? "Couldn’t send the changes to GitHub.")
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

// ── starting and stopping ────────────────────────────────────────────────────
//
// The editor records its process number in editor/.editor.pid. If an earlier copy is
// still running (closed window, Ctrl+Z, a crash), starting a new one stops the old one
// and takes over, so you never have to hunt for leftover processes.

const PID_FILE = path.join(EDITOR, ".editor.pid")
const alive = (pid) => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function stopEarlierCopy() {
  let info
  try {
    info = JSON.parse(await fs.readFile(PID_FILE, "utf8"))
  } catch {
    return
  }
  const signal = (target, sig) => {
    try {
      process.kill(target, sig)
    } catch {}
  }
  // a preview left behind (even if its editor has gone): stop its whole group
  if (info?.previewGroup) {
    signal(-info.previewGroup, "SIGCONT")
    signal(-info.previewGroup, "SIGTERM")
  }
  if (info?.pid && info.pid !== process.pid && alive(info.pid)) {
    console.log(`  Stopping the editor that was already running (process ${info.pid})…`)
    signal(info.pid, "SIGCONT") // in case it was paused with Ctrl+Z
    signal(info.pid, "SIGTERM")
    for (let i = 0; i < 20 && alive(info.pid); i++) await sleep(150)
    if (alive(info.pid)) signal(info.pid, "SIGKILL")
  }
  if (info?.previewGroup) {
    await sleep(500)
    signal(-info.previewGroup, "SIGKILL")
  }
  await sleep(200)
}

let preview
function shutdown() {
  // the preview runs in its own process group: stop the whole group, not just npx
  if (preview?.pid)
    try {
      process.kill(-preview.pid, "SIGTERM")
    } catch {}
  try {
    const info = JSON.parse(readFileSync(PID_FILE, "utf8"))
    if (info.pid === process.pid) unlinkSync(PID_FILE)
  } catch {}
}

function startPreview() {
  if (process.argv.includes("--no-preview")) return
  preview = spawn("npx", ["quartz", "build", "--serve"], {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    detached: true, // own process group, so it can be stopped as a whole
  })
  let announced = false
  const watch = (chunk) => {
    const text = String(chunk)
    if (!announced && /listening at/.test(text)) {
      announced = true
      console.log("  Site preview:  http://localhost:8080  (rebuilds whenever you save)\n")
    }
    if (/EADDRINUSE/.test(text) && !announced) {
      announced = true
      console.log("  (Site preview not started: port 8080 is in use, probably a preview left over")
      console.log("   from before. Stop it with:  pkill -f \"quartz build --serve\"  and restart.)\n")
    }
  }
  preview.stdout.on("data", watch)
  preview.stderr.on("data", watch)
}

function listen() {
  server.once("error", (e) => {
    if (e.code === "EADDRINUSE") {
      console.error(`
  Something else is using port ${PORT}, and it isn’t an editor this one can stop.
  Find it with:   ss -ltnp | grep ':${PORT}'
  and stop it with  kill <the number after pid=>,  or run the editor on another port:

    EDITOR_PORT=4001 npm run editor
`)
      process.exit(1)
    }
    throw e
  })
  server.listen(PORT, "127.0.0.1", async () => {
    console.log(`\n  Atlas editor:  http://localhost:${PORT}   (Ctrl+C to stop)`)
    startPreview()
    await fs.writeFile(PID_FILE, JSON.stringify({ pid: process.pid, previewGroup: preview?.pid ?? null }))
  })
}

for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"])
  process.on(sig, () => {
    shutdown()
    process.exit(0)
  })
process.on("exit", shutdown)

stopEarlierCopy().then(listen)
