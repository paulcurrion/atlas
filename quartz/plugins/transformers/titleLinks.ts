import { QuartzTransformerPlugin } from "../types"
import { Root, Heading } from "mdast"

/**
 * Lets a poem section's title carry links to references, written like any other link:
 *
 *   title: "Fifth. [[harpocrates|Harpocrates]]"
 *
 * The section page shows the title as a heading with working links (it counts as part
 * of the poem, so references link back to it and the graph shows the connection),
 * while the menu, graph labels, search and browser tab see the plain title,
 * "Fifth. Harpocrates".
 *
 * Must run after FrontMatter (which reads the title) and before
 * ObsidianFlavoredMarkdown (which turns [[...]] into links).
 */

const WIKILINK = /\[\[([^\]|#]+)(#[^\]|]*)?(?:\|([^\]]*))?\]\]/g

export const plainTitle = (title: string) =>
  title.replace(WIKILINK, (_m, target: string, _hash, alias?: string) => alias ?? target)

export const TitleLinks: QuartzTransformerPlugin<{ poemPrefix?: string }> = (opts) => {
  const poemPrefix = opts?.poemPrefix ?? "poem/"
  return {
    name: "TitleLinks",
    markdownPlugins() {
      return [
        () => (tree: Root, file) => {
          const slug = file.data.slug ?? ""
          if (!slug.startsWith(poemPrefix) || slug === `${poemPrefix}index`) return
          const fm = file.data.frontmatter
          const title = fm?.title
          if (!fm || typeof title !== "string" || !title.trim()) return

          const heading: Heading = {
            type: "heading",
            depth: 1,
            data: { hProperties: { className: ["section-title"], id: "title" } },
            children: [{ type: "text", value: title }],
          }
          tree.children.unshift(heading)
          fm.title = plainTitle(title)
        },
      ]
    },
  }
}
