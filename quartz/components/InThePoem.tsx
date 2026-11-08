import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import { resolveRelative, simplifySlug } from "../util/path"
import { classNames } from "../util/lang"

/**
 * On a reference page, quotes every line of the poem that links here,
 * each one linking back to its stanza.
 */
export default (() => {
  const InThePoem: QuartzComponent = ({ fileData, allFiles, displayClass }: QuartzComponentProps) => {
    if (!fileData.slug?.startsWith("refs/") || fileData.slug === "refs/index") return null
    const slug = simplifySlug(fileData.slug!)
    const occurrences = allFiles
      .filter((f) => f.slug?.startsWith("poem/"))
      .sort((a, b) => a.slug!.localeCompare(b.slug!, undefined, { numeric: true }))
      .flatMap((f) =>
        (f.poemRefs ?? []).filter((r) => r.target === slug).map((ref) => ({ file: f, ref })),
      )
      // a phrase split over two lines produces two links on the same stanza: keep both lines,
      // but drop exact duplicates
      .filter(
        (o, i, all) =>
          all.findIndex((x) => x.file.slug === o.file.slug && x.ref.line === o.ref.line) === i,
      )

    if (occurrences.length === 0) return null

    return (
      <section class={classNames(displayClass, "in-the-poem")}>
        <h3>In the poem</h3>
        <ul>
          {occurrences.map(({ file, ref }) => {
            const href =
              resolveRelative(fileData.slug!, file.slug!) + (ref.block ? `#${ref.block}` : "")
            const at = ref.line.indexOf(ref.phrase)
            const line =
              at === -1 ? (
                ref.line
              ) : (
                <>
                  {ref.line.slice(0, at)}
                  <mark>{ref.phrase}</mark>
                  {ref.line.slice(at + ref.phrase.length)}
                </>
              )
            return (
              <li>
                <a href={href} class="internal">
                  <span class="poem-line">{line}</span>
                  <span class="poem-section">{file.frontmatter?.title}</span>
                </a>
              </li>
            )
          })}
        </ul>
      </section>
    )
  }

  InThePoem.css = `
.in-the-poem { margin: 1.5rem 0 2rem; }
.in-the-poem h3 {
  font-size: 0.8rem; letter-spacing: 0.15em; text-transform: uppercase;
  color: var(--gray); margin: 0 0 0.5rem;
}
.in-the-poem ul { list-style: none; padding: 0; margin: 0; }
.in-the-poem li { margin: 0 0 0.6rem; }
.in-the-poem a.internal {
  display: block; background: none; padding: 0.6rem 0.9rem;
  border-left: 2px solid var(--secondary); border-radius: 0;
  color: var(--darkgray); font-weight: normal;
}
.in-the-poem a.internal:hover { background: var(--highlight); }
.in-the-poem .poem-line { display: block; font-style: italic; font-size: 1.1rem; }
.in-the-poem mark { background: none; color: var(--secondary); }
.in-the-poem .poem-section { display: block; font-size: 0.8rem; color: var(--gray); margin-top: 0.2rem; }
`
  return InThePoem
}) satisfies QuartzComponentConstructor
