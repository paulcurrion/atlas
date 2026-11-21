import { PageLayout, SharedLayout } from "./quartz/cfg"
import * as Component from "./quartz/components"

const isRef = (slug?: string) => !!slug?.startsWith("refs/") && slug !== "refs/index"

const graph = Component.Graph({
  localGraph: {
    depth: 2, // the current node, its neighbours, and theirs
    showTags: false,
    linkDistance: 40,
    fontSize: 0.55,
  },
  globalGraph: {
    showTags: false,
    linkDistance: 40,
    fontSize: 0.5,
  },
})

const isPoem = (slug?: string) => slug === "index" || (!!slug?.startsWith("poem/") && slug !== "poem/index")

// left-hand menu: the sections of the poem, nothing else
const sections = Component.Sections()

// components shared across all pages
export const sharedPageComponents: SharedLayout = {
  head: Component.Head(),
  header: [],
  afterBody: [],
  footer: Component.Footer({
    links: {
      "currion.net": "https://www.currion.net",
    },
  }),
}

// components for pages that display a single page (the poem, its sections, references)
export const defaultContentPageLayout: PageLayout = {
  beforeBody: [
    Component.MobileOnly(sections),
    Component.ConditionalRender({
      component: Component.PoemNav(),
      condition: (page) => page.fileData.slug !== "index",
    }),
    Component.ConditionalRender({
      component: Component.ArticleTitle(),
      // section pages show their own title, with any links in it (see titleLinks.ts)
      condition: (page) => !(page.fileData.slug?.startsWith("poem/") && page.fileData.slug !== "poem/index"),
    }),
    Component.InThePoem(),
    Component.ConditionalRender({
      component: Component.TagList(),
      condition: (page) => isRef(page.fileData.slug),
    }),
  ],
  left: [
    Component.PageTitle(),
    Component.MobileOnly(Component.Spacer()),
    Component.Search(),
    Component.DesktopOnly(sections),
  ],
  right: [
    graph,
    // on poem pages, references open here instead of replacing the poem
    Component.ConditionalRender({
      component: Component.ReferencePanel(),
      condition: (page) => isPoem(page.fileData.slug),
    }),
    Component.ConditionalRender({
      component: Component.Backlinks(),
      condition: (page) => isRef(page.fileData.slug),
    }),
  ],
}

// components for pages that display lists of pages (the reference index, reference types)
export const defaultListPageLayout: PageLayout = {
  beforeBody: [Component.MobileOnly(sections), Component.PoemNav(), Component.ArticleTitle()],
  left: [
    Component.PageTitle(),
    Component.MobileOnly(Component.Spacer()),
    Component.Search(),
    Component.DesktopOnly(sections),
  ],
  right: [graph],
}
