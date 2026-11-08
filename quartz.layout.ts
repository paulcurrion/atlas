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

const explorer = Component.Explorer({
  title: "Atlas",
  folderDefaultState: "collapsed",
  // keep the six sections in poem order rather than alphabetical
  sortFn: (a, b) => {
    if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1
    return a.slugSegment.localeCompare(b.slugSegment, undefined, { numeric: true })
  },
  filterFn: (node) => node.slugSegment !== "tags",
})

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
    Component.ConditionalRender({
      component: Component.PoemNav(),
      condition: (page) => page.fileData.slug !== "index",
    }),
    Component.ArticleTitle(),
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
    Component.DesktopOnly(explorer),
  ],
  right: [
    graph,
    Component.ConditionalRender({
      component: Component.Backlinks(),
      condition: (page) => isRef(page.fileData.slug),
    }),
  ],
}

// components for pages that display lists of pages (the reference index, reference types)
export const defaultListPageLayout: PageLayout = {
  beforeBody: [Component.PoemNav(), Component.ArticleTitle()],
  left: [
    Component.PageTitle(),
    Component.MobileOnly(Component.Spacer()),
    Component.Search(),
    Component.DesktopOnly(explorer),
  ],
  right: [graph],
}
