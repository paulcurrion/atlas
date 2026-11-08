// Atlas editor: client side. Talks to editor/server.mjs.

const $ = (sel) => document.querySelector(sel)
const el = (tag, { dataset, list, ...props } = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props)
  if (dataset) Object.assign(node.dataset, dataset)
  if (list) node.setAttribute("list", list) // read-only as a property
  for (const c of children.flat()) if (c != null) node.append(c)
  return node
}

let state = { sections: [], refs: [], todo: [] }
let refsBySlug = new Map()
let usage = new Map() // slug -> [{s, i, phrase, line}]
let tab = "refs"
let current = null // { mode: "edit"|"create", slug, pendingLink? }
let dirty = false
let pickerContext = null // { kind: "selection"|"link", s, i, k, start, end, text }

// ── talking to the server ────────────────────────────────────────────────────

async function call(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body ? { "content-type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw Object.assign(new Error(data.error ?? res.statusText), { data })
  return data
}

function status(message, kind = "") {
  const s = $("#status")
  s.textContent = message
  s.className = `status ${kind}`
  clearTimeout(status.timer)
  if (kind !== "error") status.timer = setTimeout(() => (s.textContent = ""), 4000)
}

async function reload() {
  state = await call("GET", "/api/state")
  refsBySlug = new Map(state.refs.map((r) => [r.slug, r]))
  computeUsage()
  renderPoem()
  renderList()
  if (current?.mode === "edit" && !refsBySlug.has(current.slug)) current = null
  if (!dirty) renderEditor()
}

// ── parsing poem lines ───────────────────────────────────────────────────────

const TOKEN =
  /\[\[([^\]|#]+)(#[^\]|]*)?(?:\|([^\]]*))?\]\]|\\([\\`*_{}\[\]()#+\-.!>])|(\s+\^[-_A-Za-z0-9]+\s*)$/g

function tokenize(raw) {
  const out = []
  let last = 0
  for (const m of raw.matchAll(TOKEN)) {
    if (m.index > last) out.push({ type: "text", raw: raw.slice(last, m.index) })
    if (m[1] !== undefined)
      out.push({ type: "link", raw: m[0], target: m[1].trim(), hash: m[2] ?? "", display: m[3] ?? m[1] })
    else if (m[4] !== undefined) out.push({ type: "esc", raw: m[0], display: m[4] })
    else out.push({ type: "anchor", raw: m[0] })
    last = m.index + m[0].length
  }
  if (last < raw.length) out.push({ type: "text", raw: raw.slice(last) })
  return out
}

const displayOf = (tokens) =>
  tokens.map((t) => (t.type === "text" ? t.raw : t.type === "anchor" ? "" : t.display)).join("")

// Which lines of a section file are the poem: after the frontmatter, before the footer rule.
function bodyRange(lines) {
  let i = 0
  if (lines[0] === "---") {
    i = lines.indexOf("---", 1) + 1
  }
  let end = lines.indexOf("---", i)
  if (end === -1) end = lines.length
  return [i, end]
}

function computeUsage() {
  usage = new Map()
  state.sections.forEach((sec, s) => {
    const [from, to] = bodyRange(sec.lines)
    for (let i = from; i < to; i++) {
      const tokens = tokenize(sec.lines[i])
      for (const t of tokens)
        if (t.type === "link") {
          if (!usage.has(t.target)) usage.set(t.target, [])
          usage.get(t.target).push({ s, i, phrase: t.display, line: displayOf(tokens) })
        }
    }
  })
}

const isPoemPage = (slug) => state.sections.some((s) => s.file.replace(/\.md$/, "") === slug) || slug === "index"

// ── the poem ─────────────────────────────────────────────────────────────────

function renderPoem() {
  const root = $("#sections")
  root.replaceChildren()
  state.sections.forEach((sec, s) => {
    root.append(el("h2", { textContent: sec.title }))
    const [from, to] = bodyRange(sec.lines)
    let i = from
    while (i < to && sec.lines[i].trim() === "") i++
    for (; i < to; i++) {
      const raw = sec.lines[i]
      const line = el("div", { className: raw.trim() === "" ? "line gap" : "line" })
      line.dataset.s = s
      line.dataset.i = i
      tokenize(raw).forEach((t, k) => {
        if (t.type === "text") line.append(el("span", { className: "t", textContent: t.raw, dataset: { k } }))
        else if (t.type === "esc") line.append(el("span", { className: "e", textContent: t.display }))
        else if (t.type === "link") {
          const nav = isPoemPage(t.target)
          const missing = !nav && !refsBySlug.has(t.target)
          const span = el("span", {
            className: `lk${nav ? " nav" : ""}${missing ? " missing" : ""}${current?.slug === t.target ? " current" : ""}`,
            textContent: t.display,
            title: nav ? `Link to ${t.target}` : missing ? `No reference file “${t.target}” yet` : refsBySlug.get(t.target).title,
          })
          span.dataset.k = k
          span.dataset.target = t.target
          if (!nav) span.addEventListener("click", (e) => openLinkPicker(e, span))
          line.append(span)
        }
      })
      root.append(line)
    }
  })
}

function flashLine(s, i) {
  const line = document.querySelector(`.line[data-s="${s}"][data-i="${i}"]`)
  if (!line) return
  line.scrollIntoView({ block: "center", behavior: "smooth" })
  line.classList.add("flash")
  setTimeout(() => line.classList.remove("flash"), 1200)
}

// Selecting words inside one line opens the picker.
document.addEventListener("mouseup", (e) => {
  if ($("#picker").contains(e.target)) return
  setTimeout(() => {
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed || !$("#sections").contains(sel.anchorNode)) return
    const range = sel.getRangeAt(0)
    const a = range.startContainer.parentElement
    const b = range.endContainer.parentElement
    if (a !== b || !a.classList.contains("t")) {
      status("Select words within a single line, without crossing an existing link.", "error")
      return
    }
    const text = a.textContent
    let start = range.startOffset
    let end = range.endOffset
    while (start < end && /\s/.test(text[start])) start++
    while (end > start && /\s/.test(text[end - 1])) end--
    if (start === end) return
    const phrase = text.slice(start, end)
    if (/[\[\]|]/.test(phrase)) return status("That selection contains characters a link can’t hold.", "error")
    const line = a.closest(".line")
    openPicker(range.getBoundingClientRect(), {
      kind: "selection",
      s: +line.dataset.s,
      i: +line.dataset.i,
      k: +a.dataset.k,
      start,
      end,
      text: phrase,
    })
  })
})

// Rewrite one poem line on disk.
async function writeLine(s, i, transform) {
  const sec = state.sections[s]
  const expected = sec.lines[i]
  const tokens = tokenize(expected)
  const line = transform(tokens)
  try {
    await call("POST", "/api/poem-line", { file: sec.file, index: i, expected, line })
    return true
  } catch (e) {
    status(e.message, "error")
    await reload()
    return false
  }
}

const linkMarkup = (target, display) => `[[${target}|${display}]]`

async function applyLink(ctx, target) {
  const ok = await writeLine(ctx.s, ctx.i, (tokens) =>
    tokens
      .map((t, k) => {
        if (k !== ctx.k) return t.raw
        if (ctx.kind === "selection")
          return t.raw.slice(0, ctx.start) + linkMarkup(target, ctx.text) + t.raw.slice(ctx.end)
        return linkMarkup(target, t.display) // retarget an existing link
      })
      .join(""),
  )
  if (ok) {
    status(`Linked “${ctx.text}” → ${refsBySlug.get(target)?.title ?? target}`, "ok")
    await reload()
  }
  return ok
}

async function unlink(ctx) {
  const ok = await writeLine(ctx.s, ctx.i, (tokens) =>
    tokens.map((t, k) => (k === ctx.k ? t.display : t.raw)).join(""),
  )
  if (ok) {
    status(`Removed the link from “${ctx.text}”`, "ok")
    await reload()
  }
}

// ── link picker ──────────────────────────────────────────────────────────────

function openLinkPicker(e, span) {
  e.stopPropagation()
  const line = span.closest(".line")
  const target = span.dataset.target
  const ref = refsBySlug.get(target)
  openPicker(span.getBoundingClientRect(), {
    kind: "link",
    s: +line.dataset.s,
    i: +line.dataset.i,
    k: +span.dataset.k,
    text: span.textContent,
    target,
    ref,
  })
}

function openPicker(rect, ctx) {
  pickerContext = ctx
  const picker = $("#picker")
  const head = $("#picker-head")
  const actions = $("#picker-actions")
  actions.replaceChildren()
  if (ctx.kind === "selection") {
    head.replaceChildren("Link ", el("b", { textContent: `“${ctx.text}”` }), " to…")
  } else {
    head.replaceChildren(
      el("b", { textContent: `“${ctx.text}”` }),
      " → ",
      ctx.ref ? ctx.ref.title : `${ctx.target} (no file yet)`,
    )
    actions.append(
      ctx.ref
        ? el("button", { className: "button small", textContent: "Edit reference", onclick: () => (closePicker(), selectRef(ctx.target)) })
        : el("button", {
            className: "button small",
            textContent: "Create this reference",
            onclick: () => (closePicker(), startCreate({ slug: ctx.target, title: ctx.text })),
          }),
      el("button", { className: "button small danger", textContent: "Remove link", onclick: () => (closePicker(), unlink(ctx)) }),
    )
  }
  $("#picker-search").value = ""
  renderPickerList()
  picker.classList.remove("hidden")
  const top = Math.min(rect.bottom + 8, window.innerHeight - picker.offsetHeight - 12)
  const left = Math.min(Math.max(12, rect.left), window.innerWidth - picker.offsetWidth - 12)
  picker.style.top = `${Math.max(12, top)}px`
  picker.style.left = `${left}px`
  $("#picker-search").focus()
}

function closePicker() {
  $("#picker").classList.add("hidden")
  pickerContext = null
}

const norm = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")

function renderPickerList() {
  const ctx = pickerContext
  if (!ctx) return
  const q = norm($("#picker-search").value.trim())
  const list = $("#picker-list")
  list.replaceChildren()

  // suggestions from the to-do list whose phrase overlaps the selection
  const phrase = norm(ctx.text)
  const todos = state.todo.filter(
    (t) => !refsBySlug.has(t.slug) && (norm(t.phrase).includes(phrase) || phrase.includes(norm(t.phrase.split(" / ")[0]))),
  )
  for (const t of todos.slice(0, 3)) {
    list.append(
      el(
        "li",
        { onclick: () => chooseTodo(t) },
        el("div", { className: "title", textContent: `＋ ${titleFromSlug(t.slug)}` }),
        el("div", { className: "meta", textContent: `from your to-do list · ${t.note.slice(0, 80)}…` }),
      ),
    )
  }

  const matches = state.refs
    .filter((r) => !q || norm(r.title).includes(q) || r.slug.includes(q) || r.tags.some((t) => norm(t).includes(q)))
    .filter((r) => ctx.kind !== "link" || r.slug !== ctx.target)
    .sort((a, b) => a.title.localeCompare(b.title))
  for (const r of matches.slice(0, 40)) {
    list.append(
      el(
        "li",
        { onclick: () => chooseRef(r.slug) },
        el("div", { className: "title", textContent: r.title }),
        el("div", { className: "meta", textContent: `${r.tags.join(", ") || "no type"} · ${usage.get(r.slug)?.length ?? 0} in poem` }),
      ),
    )
  }

  if (ctx.kind === "selection") {
    const title = $("#picker-search").value.trim() || capitalise(ctx.text)
    list.append(
      el(
        "li",
        { onclick: () => chooseNew(title) },
        el("div", { className: "title", textContent: `＋ New reference “${title}”` }),
        el("div", { className: "meta", textContent: "create it and link this phrase" }),
      ),
    )
  }
}

async function chooseRef(slug) {
  const ctx = pickerContext
  closePicker()
  window.getSelection()?.removeAllRanges()
  await applyLink(ctx, slug)
}

function chooseNew(title) {
  const ctx = pickerContext
  closePicker()
  startCreate({ title, slug: slugify(title), pendingLink: ctx })
}

function chooseTodo(t) {
  const ctx = pickerContext
  closePicker()
  startCreate(todoDraft(t, ctx))
}

$("#picker-search").addEventListener("input", renderPickerList)
$("#picker-search").addEventListener("keydown", (e) => {
  if (e.key === "Escape") closePicker()
  if (e.key === "Enter") $("#picker-list li")?.click()
})
document.addEventListener("mousedown", (e) => {
  if (!$("#picker").classList.contains("hidden") && !$("#picker").contains(e.target)) closePicker()
})

// ── sidebar ──────────────────────────────────────────────────────────────────

const titleFromSlug = (slug) => capitalise(slug.replace(/-/g, " "))
const capitalise = (s) => s.charAt(0).toUpperCase() + s.slice(1)
const slugify = (s) =>
  norm(s)
    .replace(/[’'"“”]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60)

function renderList() {
  const q = norm($("#filter").value.trim())
  const list = $("#list")
  list.replaceChildren()
  const todoOpen = state.todo.filter((t) => !refsBySlug.has(t.slug)).length
  $("#count-refs").textContent = state.refs.length
  $("#count-todo").textContent = todoOpen
  $("#unlinked-toggle").classList.toggle("hidden", tab !== "refs")
  $("#done-toggle").classList.toggle("hidden", tab !== "todo")

  if (tab === "refs") {
    const onlyUnlinked = $("#only-unlinked").checked
    state.refs
      .filter((r) => !q || norm(r.title).includes(q) || r.slug.includes(q) || r.tags.some((t) => norm(t).includes(q)))
      .filter((r) => !onlyUnlinked || !usage.has(r.slug))
      .sort((a, b) => a.title.localeCompare(b.title))
      .forEach((r) => {
        const n = usage.get(r.slug)?.length ?? 0
        list.append(
          el(
            "li",
            { className: current?.slug === r.slug ? "active" : "", onclick: () => selectRef(r.slug) },
            el("div", { className: "title", textContent: r.title }),
            el(
              "div",
              { className: "meta" },
              `${r.tags.join(", ") || "no type"} · `,
              n ? `${n} in poem` : el("span", { className: "warn", textContent: "not in poem" }),
            ),
          ),
        )
      })
  } else {
    const hideDone = $("#hide-done").checked
    let group = null
    for (const t of state.todo) {
      const done = refsBySlug.has(t.slug)
      if ((hideDone && done) || (q && !norm(`${t.phrase} ${t.slug} ${t.note}`).includes(q))) continue
      if (t.section !== group) {
        group = t.section
        list.append(el("li", { className: "group", textContent: group }))
      }
      list.append(
        el(
          "li",
          { className: done ? "done" : "", onclick: () => (done ? selectRef(t.slug) : startCreate(todoDraft(t))) },
          el("div", { className: "title", textContent: t.phrase }),
          el(
            "div",
            { className: "meta" },
            t.slug,
            t.uncertain ? el("span", { className: "warn", textContent: " · to confirm" }) : null,
          ),
        ),
      )
    }
  }
}

document.querySelectorAll(".tab").forEach((b) =>
  b.addEventListener("click", () => {
    tab = b.dataset.tab
    document.querySelectorAll(".tab").forEach((x) => x.classList.toggle("active", x === b))
    renderList()
  }),
)
$("#filter").addEventListener("input", renderList)
$("#only-unlinked").addEventListener("change", renderList)
$("#hide-done").addEventListener("change", renderList)
$("#new-ref").addEventListener("click", () => startCreate({ title: "", slug: "" }))

// A to-do entry becomes a draft reference. If its phrase sits on one line of the
// poem, unlinked, the new reference will be linked there when it is created.
function todoDraft(t, ctx = null) {
  const body = (t.uncertain ? "**[To confirm]** " : "") + capitalise(t.note.replace(/^[,;:\s]+/, ""))
  return { slug: t.slug, title: titleFromSlug(t.slug), body, pendingLink: ctx ?? findPhrase(t.phrase) }
}

function findPhrase(phrase) {
  const first = phrase.split(" / ")[0].replace(/…/g, "").trim()
  if (!first || /^section title$/i.test(first)) return null
  for (const [s, sec] of state.sections.entries()) {
    const [from, to] = bodyRange(sec.lines)
    for (let i = from; i < to; i++) {
      const tokens = tokenize(sec.lines[i])
      for (const [k, t] of tokens.entries()) {
        if (t.type !== "text") continue
        const at = t.raw.indexOf(first)
        if (at !== -1) return { kind: "selection", s, i, k, start: at, end: at + first.length, text: first }
      }
    }
  }
  return null
}

// ── reference editor ─────────────────────────────────────────────────────────

function confirmDiscard() {
  return !dirty || confirm("You have unsaved changes to this reference. Discard them?")
}

function selectRef(slug) {
  if (current?.slug === slug && current.mode === "edit") return
  if (!confirmDiscard()) return
  current = { mode: "edit", slug }
  dirty = false
  renderEditor()
  renderList()
  renderPoem()
}

function startCreate(draft) {
  if (!confirmDiscard()) return
  current = { mode: "create", ...draft }
  dirty = !!(draft.title || draft.body)
  renderEditor()
  renderList()
  if (draft.pendingLink) flashLine(draft.pendingLink.s, draft.pendingLink.i)
  $("#f-title")?.focus()
}

function markDirty() {
  dirty = true
  const d = $("#dirty")
  if (d) d.textContent = "Unsaved changes"
}

function renderEditor() {
  const root = $("#editor")
  root.replaceChildren()
  const append = (...xs) => root.append(...xs.flat().filter((x) => x != null))
  if (!current) {
    append(
      el(
        "div",
        { className: "empty" },
        el("h2", { textContent: "References" }),
        el("p", { textContent: "Select words in the poem to link them, or choose a reference on the left to edit it." }),
        el("p", { textContent: "The To-do tab lists the references still to add. Click one to start it with its one-line identification filled in, ready to link to its phrase in the poem." }),
        el("p", { textContent: "Every save writes straight into content/, so the site preview updates within a second or two. When you’re happy, use Publish to put it online." }),
      ),
    )
    return
  }

  const creating = current.mode === "create"
  const ref = creating ? { slug: current.slug ?? "", title: current.title ?? "", tags: [], body: current.body ?? "", extra: {} } : refsBySlug.get(current.slug)
  if (!ref) return

  const allTags = [...new Set(state.refs.flatMap((r) => r.tags))].sort()
  let slugTouched = !creating || !!current.slug && current.slug !== slugify(current.title ?? "")

  const title = el("input", { id: "f-title", value: ref.title, oninput: () => {
    markDirty()
    if (creating && !slugTouched) slug.value = slugify(title.value)
  } })
  const slug = el("input", { id: "f-slug", value: ref.slug, disabled: !creating, oninput: () => ((slugTouched = true), markDirty()) })
  const tags = el("input", { id: "f-tags", value: ref.tags.join(", "), oninput: markDirty, placeholder: "e.g. literature", list: "tag-options" })
  const body = el("textarea", { id: "f-body", rows: 14, value: ref.body, oninput: markDirty })

  append(
    el("h2", { textContent: creating ? "New reference" : ref.title }),
    creating ? null : el("div", { className: "slug", textContent: `content/refs/${ref.slug}.md` }),
    el("label", {}, "Title", title),
    creating ? el("label", {}, "File name (lowercase, hyphens; this is what links point to)", slug) : null,
    el("label", {}, "Type (comma-separate several)", tags),
    el("datalist", { id: "tag-options" }, allTags.map((t) => el("option", { value: t }))),
    el("label", {}, "Text (Markdown; the first paragraph is the one-line identification)", body),
  )

  // see-also helper
  const seeInput = el("input", { placeholder: "Add a “See also” link…", list: "ref-options" })
  const addSee = () => {
    const r = state.refs.find((x) => x.title === seeInput.value || x.slug === seeInput.value)
    if (!r) return status("Choose a reference from the list.", "error")
    const link = `[[${r.slug}|${r.title}]]`
    const lines = body.value.split("\n")
    const at = lines.findIndex((l) => /^See also:/.test(l))
    if (at === -1) body.value = body.value.trimEnd() + `\n\nSee also: ${link}`
    else if (!lines[at].includes(`[[${r.slug}|`)) {
      lines[at] = lines[at].trimEnd() + ` · ${link}`
      body.value = lines.join("\n")
    }
    seeInput.value = ""
    markDirty()
  }
  seeInput.addEventListener("keydown", (e) => e.key === "Enter" && (e.preventDefault(), addSee()))
  append(
    el("div", { className: "see-also" }, seeInput, el("button", { className: "button small ghost", textContent: "Add", onclick: addSee })),
    el("datalist", { id: "ref-options" }, state.refs.filter((r) => r.slug !== ref.slug).map((r) => el("option", { value: r.title }))),
  )

  // pending link notice when creating
  if (creating) {
    const p = current.pendingLink
    append(
      p
        ? el("div", { className: "pending" }, `Will link “${p.text}” in ${state.sections[p.s].title} when created.`)
        : el("div", { className: "pending warn" }, "Not linked to the poem yet: after creating it, select its phrase in the poem and choose it."),
    )
  }

  // buttons
  const save = el("button", { className: "button", textContent: creating ? (current.pendingLink ? "Create and link" : "Create") : "Save" })
  save.addEventListener("click", () => saveRef({ creating, slug: slug.value.trim(), title: title.value, tags: tags.value, body: body.value, extra: ref.extra }))
  const row = el("div", { className: "row" }, save, el("span", { id: "dirty", className: "dirty", textContent: dirty ? "Unsaved changes" : "" }), el("span", { className: "spacer" }))
  if (creating) {
    row.append(el("button", { className: "button ghost", textContent: "Cancel", onclick: () => { dirty = false; current = null; renderEditor() } }))
  } else {
    row.append(el("a", { className: "button ghost", href: `http://localhost:8080/refs/${ref.slug}`, target: "_blank", rel: "noopener", textContent: "View ↗" }))
    const used = usage.has(ref.slug) || state.refs.some((r) => r.linksTo.includes(ref.slug))
    const del = el("button", { className: "button danger", textContent: "Delete", disabled: used, title: used ? "Remove the links to this reference before deleting it" : "" })
    del.addEventListener("click", () => deleteRef(ref.slug))
    row.append(del)
  }
  append(row)

  if (creating) return

  // where it is used
  const uses = usage.get(ref.slug) ?? []
  append(el("h3", { textContent: "In the poem" }))
  append(
    uses.length
      ? el(
          "ul",
          { className: "list usage" },
          uses.map((u) => {
            const at = u.line.indexOf(u.phrase)
            return el(
              "li",
              { onclick: () => flashLine(u.s, u.i) },
              at === -1 ? u.line : [u.line.slice(0, at), el("mark", { textContent: u.phrase }), u.line.slice(at + u.phrase.length)],
              el("div", { className: "meta", textContent: state.sections[u.s].title }),
            )
          }),
        )
      : el("p", { className: "meta", textContent: "Not linked from the poem yet. Select its phrase in the poem to link it." }),
  )
  const from = state.refs.filter((r) => r.linksTo.includes(ref.slug))
  if (from.length) {
    append(
      el("h3", { textContent: "Linked from references" }),
      el("ul", { className: "list" }, from.map((r) => el("li", { onclick: () => selectRef(r.slug) }, el("div", { className: "title", textContent: r.title })))),
    )
  }
}

async function saveRef({ creating, slug, title, tags, body, extra }) {
  const payload = {
    create: creating,
    slug,
    title: title.trim(),
    tags: tags.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean),
    body,
    extra,
  }
  try {
    await call("POST", "/api/ref", payload)
  } catch (e) {
    return status(e.message, "error")
  }
  const pending = creating ? current.pendingLink : null
  dirty = false
  current = { mode: "edit", slug }
  await reload()
  if (pending) await applyLink(pending, slug)
  status(creating ? `Created “${payload.title}”` : `Saved “${payload.title}”`, "ok")
  renderEditor()
  renderList()
}

async function deleteRef(slug) {
  if (!confirm(`Delete content/refs/${slug}.md? This can’t be undone from the editor.`)) return
  try {
    await call("DELETE", `/api/ref/${encodeURIComponent(slug)}`)
    current = null
    dirty = false
    status("Deleted", "ok")
    await reload()
  } catch (e) {
    status(e.message, "error")
  }
}

document.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === "s") {
    e.preventDefault()
    $("#editor .row .button")?.click()
  }
})
window.addEventListener("beforeunload", (e) => {
  if (dirty) e.preventDefault()
})
// pick up edits made in Obsidian meanwhile
window.addEventListener("focus", () => {
  if (!dirty) reload().catch(() => {})
})

// ── publishing ───────────────────────────────────────────────────────────────

const dialog = $("#publish")
$("#publish-open").addEventListener("click", async () => {
  const out = $("#publish-output")
  out.classList.add("hidden")
  const list = $("#changes")
  list.replaceChildren(el("li", { textContent: "Checking…" }))
  dialog.showModal()
  try {
    const { changes } = await call("GET", "/api/changes")
    list.replaceChildren(...(changes.length ? changes.map((c) => el("li", { textContent: c })) : [el("li", { textContent: "Nothing has changed." })]))
    $("#publish-go").disabled = !changes.length
  } catch (e) {
    list.replaceChildren(el("li", { textContent: e.message }))
  }
})
$("#publish-cancel").addEventListener("click", () => dialog.close())
$("#publish-go").addEventListener("click", async () => {
  const out = $("#publish-output")
  const go = $("#publish-go")
  go.disabled = true
  out.classList.remove("hidden")
  out.textContent = "Publishing…"
  try {
    const r = await call("POST", "/api/publish", { message: $("#publish-message").value })
    out.textContent = r.output + "Done. The site will update in a minute or two."
    $("#publish-message").value = ""
  } catch (e) {
    out.textContent = (e.data?.output ?? "") + e.message
    go.disabled = false
  }
})

reload().catch((e) => status(`Couldn’t load: ${e.message}`, "error"))
