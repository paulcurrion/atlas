type Stop = { path: string; title: string }
const TRAIL_KEY = "atlas-trail"
const RETURN_KEY = "atlas-return"
const TRAIL_LENGTH = 7

function load<T>(key: string, fallback: T): T {
  try {
    const raw = sessionStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function save(key: string, value: unknown) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value))
  } catch {
    // storage unavailable (private mode etc.): navigation still works, just without memory
  }
}

function isPoemPage() {
  const slug = document.body.dataset.slug ?? ""
  return slug === "index" || slug.startsWith("poem/")
}

// Remember the stanza a reader leaves from, so "Return to the poem" takes them back there.
document.addEventListener(
  "click",
  (e) => {
    const link = (e.target as Element | null)?.closest?.("article a.internal")
    if (!link || !isPoemPage()) return
    const stanza = link.closest("p[id]")
    save(RETURN_KEY, location.pathname + (stanza ? `#${stanza.id}` : ""))
  },
  true,
)

document.addEventListener("nav", () => {
  const title =
    document.querySelector("h1.article-title")?.textContent?.trim() ||
    document.title.split("|")[0].trim()

  let trail = load<Stop[]>(TRAIL_KEY, [])
  if (trail.at(-1)?.path !== location.pathname) trail.push({ path: location.pathname, title })
  trail = trail.slice(-TRAIL_LENGTH)
  save(TRAIL_KEY, trail)

  const back = document.querySelector<HTMLAnchorElement>("a.return-to-poem")
  const returnTo = load<string | null>(RETURN_KEY, null)
  if (back && returnTo) back.href = returnTo

  const list = document.querySelector(".reading-trail")
  if (list) {
    list.replaceChildren()
    if (trail.length > 1) {
      for (const stop of trail) {
        const li = document.createElement("li")
        if (stop.path === location.pathname) {
          li.textContent = stop.title
        } else {
          const a = document.createElement("a")
          a.href = stop.path
          a.className = "internal"
          a.textContent = stop.title
          li.appendChild(a)
        }
        list.appendChild(li)
      }
    }
  }

  // Briefly light up the stanza a reader returns to.
  if (location.hash) {
    const target = document.getElementById(decodeURIComponent(location.hash.slice(1)))
    if (target) {
      target.classList.add("arrived")
      setTimeout(() => target.classList.remove("arrived"), 2500)
    }
  }
})
