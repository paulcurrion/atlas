import { QuartzTransformerPlugin } from "../types"
import { Element, ElementContent, Root as HtmlRoot } from "hast"
import { toString } from "hast-util-to-string"
import { visit } from "unist-util-visit"
import { simplifySlug, FullSlug, SimpleSlug } from "../../util/path"

/**
 * One occurrence of a reference link inside the poem:
 * which reference it points to, the full line it sits on,
 * the linked words, and the stanza (block id) it belongs to.
 */
export interface PoemRef {
  target: SimpleSlug
  line: string
  phrase: string
  block?: string
}

interface Options {
  /** Only pages whose slug starts with this prefix are treated as poem pages. */
  poemPrefix: string
}

const defaultOptions: Options = { poemPrefix: "poem/" }

function containsNode(node: ElementContent, target: Element): boolean {
  if (node === target) return true
  if (node.type !== "element") return false
  return node.children.some((c) => containsNode(c, target))
}

/**
 * Records every internal link in the poem together with the line it occurs on,
 * so reference pages can show readers exactly where in the poem they came from.
 * Must run after CrawlLinks (which sets data-slug on internal links).
 */
export const PoemLines: QuartzTransformerPlugin<Partial<Options>> = (userOpts) => {
  const opts = { ...defaultOptions, ...userOpts }
  return {
    name: "PoemLines",
    htmlPlugins() {
      return [
        () => (tree: HtmlRoot, file) => {
          const refs: PoemRef[] = []
          file.data.poemRefs = refs
          if (!file.data.slug?.startsWith(opts.poemPrefix)) return

          visit(tree, "element", (p: Element) => {
            if (p.tagName !== "p") return
            const block = typeof p.properties?.id === "string" ? p.properties.id : undefined

            // split the stanza into lines at <br>
            const lines: ElementContent[][] = [[]]
            for (const child of p.children) {
              if (child.type === "element" && child.tagName === "br") lines.push([])
              else lines.at(-1)!.push(child)
            }

            visit(p, "element", (a: Element) => {
              if (a.tagName !== "a") return
              const slug = a.properties?.["data-slug"] ?? a.properties?.dataSlug
              if (typeof slug !== "string") return
              const line = lines.find((l) => l.some((n) => containsNode(n, a))) ?? []
              refs.push({
                target: simplifySlug(slug as FullSlug),
                line: line
                  .map((n) => toString(n))
                  .join("")
                  .trim(),
                phrase: toString(a).trim(),
                block,
              })
            })
          })
        },
      ]
    },
  }
}

declare module "vfile" {
  interface DataMap {
    poemRefs: PoemRef[]
  }
}
