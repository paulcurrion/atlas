import { QuartzConfig } from "./quartz/cfg"
import * as Plugin from "./quartz/plugins"

/**
 * Quartz 4 Configuration
 *
 * See https://quartz.jzhao.xyz/configuration for more information.
 */
const config: QuartzConfig = {
  configuration: {
    pageTitle: "An Atlas of Haunted Houses",
    pageTitleSuffix: "",
    enableSPA: true,
    enablePopovers: false,
    analytics: null,
    locale: "en-GB",
    baseUrl: "atlas.currion.net",
    ignorePatterns: ["private", "templates", ".obsidian"],
    defaultDateType: "modified",
    theme: {
      fontOrigin: "googleFonts",
      cdnCaching: true,
      typography: {
        header: "Cormorant Garamond",
        body: "EB Garamond",
        code: "IBM Plex Mono",
      },
      colors: {
        // The atlas is always dark: both modes share one palette.
        // "secondary" is haint blue, used for every link into the atlas.
        lightMode: {
          light: "#050608",
          lightgray: "#1b2026",
          gray: "#6b7580",
          darkgray: "#cfd5dc",
          dark: "#eef2f6",
          secondary: "#8fd3dc",
          tertiary: "#d6eef1",
          highlight: "rgba(143, 211, 220, 0.10)",
          textHighlight: "rgba(143, 211, 220, 0.30)",
        },
        darkMode: {
          light: "#050608",
          lightgray: "#1b2026",
          gray: "#6b7580",
          darkgray: "#cfd5dc",
          dark: "#eef2f6",
          secondary: "#8fd3dc",
          tertiary: "#d6eef1",
          highlight: "rgba(143, 211, 220, 0.10)",
          textHighlight: "rgba(143, 211, 220, 0.30)",
        },
      },
    },
  },
  plugins: {
    transformers: [
      Plugin.FrontMatter(),
      Plugin.CreatedModifiedDate({
        priority: ["frontmatter", "git", "filesystem"],
      }),
      Plugin.SyntaxHighlighting({
        theme: {
          light: "github-light",
          dark: "github-dark",
        },
        keepBackground: false,
      }),
      Plugin.ObsidianFlavoredMarkdown({ enableInHtmlEmbed: false }),
      Plugin.GitHubFlavoredMarkdown(),
      Plugin.TableOfContents(),
      Plugin.HardLineBreaks(),
      Plugin.CrawlLinks({ markdownLinkResolution: "shortest" }),
      Plugin.PoemLines(),
      Plugin.Description(),
      Plugin.Latex({ renderEngine: "katex" }),
    ],
    filters: [Plugin.RemoveDrafts()],
    emitters: [
      Plugin.AliasRedirects(),
      Plugin.ComponentResources(),
      Plugin.ContentPage(),
      Plugin.FolderPage(),
      Plugin.TagPage(),
      Plugin.ContentIndex({
        enableSiteMap: true,
        enableRSS: true,
      }),
      Plugin.Assets(),
      Plugin.Static(),
      Plugin.Favicon(),
      Plugin.NotFoundPage(),
      // Social-media preview images; slow to build, enable when the site launches
      // Plugin.CustomOgImages(),
    ],
  },
}

export default config
