import { normalizeRelativeURLs } from "../../util/path"
import { fetchCanonical } from "./util"

// On poem pages, references open in the panel under the graph rather than
// replacing the poem. Every other link behaves as before.

const parser = new DOMParser()
let trigger: HTMLElement | null = null
let request = 0

// Tell screen readers that links to outside sources open in a new tab.
function labelNewTabLinks(root: ParentNode) {
  root.querySelectorAll<HTMLAnchorElement>('a.external[target="_blank"]').forEach((a) => {
    if (a.querySelector(".sr-only")) return
    a.append(Object.assign(document.createElement("span"), { className: "sr-only", textContent: " (opens in a new tab)" }))
  })
}

const panel = () => document.querySelector<HTMLElement>(".reference-panel")

function isPoemPage() {
  const slug = document.body.dataset.slug ?? ""
  return slug === "index" || slug.startsWith("poem/")
}

function referenceLink(target: EventTarget | null): HTMLAnchorElement | null {
  if (!(target instanceof Element)) return null
  const a = target.closest<HTMLAnchorElement>("a.internal")
  const slug = a?.dataset.slug
  if (!a || !slug || !slug.startsWith("refs/") || slug === "refs/index") return null
  return a
}

function markActive(slug: string | null) {
  document.querySelectorAll("article a.ref-active").forEach((a) => a.classList.remove("ref-active"))
  if (!slug) return
  document
    .querySelectorAll(`article a.internal[data-slug="${CSS.escape(slug)}"]`)
    .forEach((a) => a.classList.add("ref-active"))
}

function close() {
  const el = panel()
  if (!el || el.classList.contains("empty")) return
  request++
  el.classList.add("empty")
  el.classList.remove("loading")
  el.replaceChildren(
    Object.assign(document.createElement("p"), {
      className: "reference-hint",
      textContent: "Choose a highlighted phrase to read its reference here.",
    }),
  )
  markActive(null)
  trigger?.focus({ preventScroll: true })
  trigger = null
}

async function open(link: HTMLAnchorElement) {
  const el = panel()
  if (!el) return false
  const url = new URL(link.href)
  url.hash = ""
  const slug = link.dataset.slug!
  const mine = ++request
  el.classList.add("loading")

  let doc: Document
  try {
    const res = await fetchCanonical(url)
    if (!res.ok) throw new Error(String(res.status))
    doc = parser.parseFromString(await res.text(), "text/html")
  } catch {
    el.classList.remove("loading")
    return false
  }
  if (mine !== request) return true // a later click won
  normalizeRelativeURLs(doc, url)

  const title = doc.querySelector("h1.article-title")?.textContent?.trim() ?? ""
  const head = document.createElement("div")
  head.className = "ref-head"
  const heading = Object.assign(document.createElement("h2"), { textContent: title, tabIndex: -1 })
  const titleBox = document.createElement("div")
  titleBox.style.flex = "1"
  titleBox.append(Object.assign(document.createElement("div"), { className: "ref-label", textContent: "Reference" }), heading)
  const closeButton = Object.assign(document.createElement("button"), {
    className: "ref-close",
    type: "button",
    textContent: "×",
    title: "Close",
  })
  closeButton.setAttribute("aria-label", "Close reference")
  closeButton.addEventListener("click", close)
  head.append(titleBox, closeButton)

  const parts: Node[] = [head]
  const tags = doc.querySelector(".page-header .tags")
  if (tags) parts.push(tags)
  const body = document.createElement("div")
  body.className = "ref-body"
  const article = doc.querySelector("article")
  if (article) body.append(...Array.from(article.childNodes))
  parts.push(body)
  const inPoem = doc.querySelector(".in-the-poem")
  if (inPoem) parts.push(inPoem)
  const full = Object.assign(document.createElement("a"), {
    className: "internal ref-page",
    href: url.toString(),
    textContent: "Open as its own page →",
  })
  parts.push(full)

  labelNewTabLinks(body)
  el.replaceChildren(...parts)
  el.classList.remove("empty", "loading")
  el.scrollTop = 0
  markActive(slug)
  heading.focus({ preventScroll: true })

  // On smaller screens the panel slides up over the bottom of the page:
  // keep the phrase that was tapped visible above it.
  if (getComputedStyle(el).position === "fixed" && trigger) {
    const covered = window.innerHeight - el.getBoundingClientRect().height
    const bottom = trigger.getBoundingClientRect().bottom
    if (bottom > covered - 16) window.scrollBy({ top: bottom - covered + 48, behavior: "smooth" })
  }
  return true
}

// Capture phase on document runs before Quartz's own router (which listens on window).
document.addEventListener(
  "click",
  async (e) => {
    if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return
    if (!isPoemPage() || !panel()) return
    const link = referenceLink(e.target)
    if (!link) return
    // "Open as its own page" should navigate
    if (link.classList.contains("ref-page")) return
    e.preventDefault()
    e.stopPropagation()
    if (!panel()!.contains(link)) trigger = link
    const ok = await open(link)
    if (!ok) window.location.href = link.href // fall back to a normal page load
  },
  true,
)

// Links in the panel's "In the poem" card that point at this same page: scroll there and
// light up the stanza (Quartz scrolls, but only fires its "nav" event for new pages).
document.addEventListener("click", (e) => {
  if (!(e.target instanceof Element)) return
  const a = e.target.closest<HTMLAnchorElement>(".reference-panel .in-the-poem a")
  if (!a) return
  const url = new URL(a.href)
  if (url.pathname !== location.pathname || !url.hash) return
  setTimeout(() => {
    const stanza = document.getElementById(decodeURIComponent(url.hash.slice(1)))
    if (!stanza) return
    stanza.classList.add("arrived")
    setTimeout(() => stanza.classList.remove("arrived"), 2500)
  }, 50)
})

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") close()
})

document.addEventListener("nav", () => {
  trigger = null
  request++
  labelNewTabLinks(document.body)
})
