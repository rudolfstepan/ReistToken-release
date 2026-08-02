import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { Renderer, marked } from "marked";
import { publicSiteUrl } from "./site-publication.js";

const documentPairs = [
  {
    de: {
      source: "docs/TOKENOMICS.md",
      target: "docs/token-und-verteilung.html",
      seoTitle: "REIST Research Token (REIST) — Vertrag und Verteilung",
      description:
        "Offizielle Base-Sepolia-Dokumentation des REIST Research Token (REIST): Vertrag 0xF2960B84525dF8Da9C038EA85AE5e3B4D0C26A68.",
    },
    en: {
      source: "docs/en/TOKEN_AND_ALLOCATION.md",
      target: "en/docs/token-and-allocation.html",
      seoTitle: "REIST Research Token (REIST) — Contract and Allocation",
      description:
        "Official Base Sepolia documentation for the REIST Research Token (REIST): contract 0xF2960B84525dF8Da9C038EA85AE5e3B4D0C26A68.",
    },
  },
  {
    de: { source: "docs/RISKS.md", target: "docs/risiken.html" },
    en: { source: "docs/en/RISKS.md", target: "en/docs/risks.html" },
  },
  {
    de: { source: "docs/LEGAL_NOTICE.md", target: "docs/rechtlicher-hinweis.html" },
    en: { source: "docs/en/LEGAL_NOTICE.md", target: "en/docs/legal-notice.html" },
  },
  {
    de: { source: "SECURITY.md", target: "docs/sicherheitsrichtlinie.html" },
    en: { source: "docs/en/SECURITY.md", target: "en/docs/security-policy.html" },
  },
  {
    de: { source: "TRADEMARKS.md", target: "docs/markenhinweis.html" },
    en: { source: "docs/en/TRADEMARKS.md", target: "en/docs/trademark-notice.html" },
  },
];

export const publicDocumentBuilds = documentPairs.flatMap((pair) => [
  { ...pair.de, alternate: pair.en.target, language: "de", xDefault: pair.de.target },
  { ...pair.en, alternate: pair.de.target, language: "en", xDefault: pair.de.target },
]);

function fail(message) {
  throw new Error(message);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function webRelative(fromFile, toPath) {
  return relative(dirname(fromFile), toPath).replaceAll("\\", "/") || ".";
}

function directoryHref(fromFile, directory) {
  const path = webRelative(fromFile, directory);
  return path === "." ? "./" : `${path.replace(/\/$/, "")}/`;
}

function rewriteLocalMarkdownLink(href) {
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("#")) return href;
  return href.replace(/\.md(?=([?#]|$))/i, ".html");
}

function validateLink(href, sourcePath) {
  const value = String(href || "").trim();
  const compact = value.replace(/[\u0000-\u0020\u007f]+/g, "").toLowerCase();
  if (!value || value.startsWith("//") || value.startsWith("\\")) {
    fail(`${sourcePath}: unsicherer oder leerer Link: ${href}`);
  }
  const scheme = compact.match(/^([a-z][a-z0-9+.-]*):/i)?.[1];
  if (scheme && !new Set(["https", "mailto"]).has(scheme)) {
    fail(`${sourcePath}: nicht erlaubtes Link-Protokoll: ${scheme}`);
  }
  return rewriteLocalMarkdownLink(value);
}

function slugger() {
  const counts = new Map();
  return (text) => {
    const base = String(text)
      .replaceAll("ß", "ss")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "abschnitt";
    const count = counts.get(base) || 0;
    counts.set(base, count + 1);
    return count === 0 ? base : `${base}-${count + 1}`;
  };
}

function renderMarkdown(sourcePath) {
  const markdown = readFileSync(resolve(sourcePath), "utf8").replace(
    /^[\u200B-\u200F\uFEFF]/,
    ""
  );
  const tokens = marked.lexer(markdown, { gfm: true });
  const titleTokens = tokens.filter(
    (token) => token.type === "heading" && token.depth === 1
  );
  if (titleTokens.length !== 1) {
    fail(`${sourcePath}: genau eine H1-Überschrift ist erforderlich.`);
  }

  const headingSlug = slugger();
  const renderer = new Renderer();
  const defaultTableRenderer = renderer.table;
  renderer.heading = function ({ depth, text, tokens: inlineTokens }) {
    const content = this.parser.parseInline(inlineTokens);
    return `<h${depth} id="${escapeHtml(headingSlug(text))}">${content}</h${depth}>\n`;
  };
  renderer.link = function ({ href, title, tokens: inlineTokens }) {
    const content = this.parser.parseInline(inlineTokens);
    const titleAttribute = title ? ` title="${escapeHtml(title)}"` : "";
    const externalAttribute = href.startsWith("https:") ? ' rel="noreferrer"' : "";
    return `<a href="${escapeHtml(href)}"${titleAttribute}${externalAttribute}>${content}</a>`;
  };
  renderer.table = function (token) {
    return `<div class="document-table-wrap">${defaultTableRenderer.call(this, token)}</div>\n`;
  };

  const content = marked.parse(markdown, {
    async: false,
    gfm: true,
    renderer,
    walkTokens(token) {
      if (token.type === "html") {
        fail(`${sourcePath}: Roh-HTML ist in öffentlichen Dokumenten nicht erlaubt.`);
      }
      if (token.type === "image") {
        fail(`${sourcePath}: Bilder müssen als geprüfte Website-Assets eingebunden werden.`);
      }
      if (token.type === "link") {
        token.href = validateLink(token.href, sourcePath);
      }
    },
  });
  if (/<(?:script|style)\b|\son[a-z]+\s*=/i.test(content)) {
    fail(`${sourcePath}: unsicheres HTML im Renderergebnis.`);
  }
  return { content, title: titleTokens[0].text };
}

function documentTemplate(configuration, rendered) {
  const { alternate, language, target, xDefault } = configuration;
  const isEnglish = language === "en";
  const siteDirectory = isEnglish ? "en" : ".";
  const homeHref = directoryHref(target, siteDirectory);
  const stylesheetHref = webRelative(target, "styles.css");
  const languageScriptHref = webRelative(target, "language.js");
  const markHref = webRelative(target, "assets/reist-mark.svg");
  const alternateHref = webRelative(target, alternate);
  const canonicalUrl = publicSiteUrl(target);
  const alternateUrl = publicSiteUrl(alternate);
  const xDefaultUrl = publicSiteUrl(xDefault);
  const germanUrl = isEnglish ? alternateUrl : canonicalUrl;
  const englishUrl = isEnglish ? canonicalUrl : alternateUrl;
  const alternateLanguage = isEnglish ? "de" : "en";
  const documentLabel = isEnglish ? "Project documentation" : "Projektdokumentation";
  const overviewLabel = isEnglish ? "Project overview" : "Projektübersicht";
  const switchLabel = isEnglish ? "Switch to German" : "Englische Fassung öffnen";
  const updatedLabel = isEnglish ? "Updated" : "Stand";
  const autoLanguageAttribute = isEnglish
    ? ""
    : '\n  data-auto-language="true"';
  const description =
    configuration.description ||
    (isEnglish
      ? `REIST project document: ${rendered.title}.`
      : `REIST-Projektdokument: ${rendered.title}.`);
  const pageTitle = configuration.seoTitle || `${rendered.title} — REIST`;

  return `<!doctype html>
<html
  lang="${language}"
  data-alternate-language-url="${escapeHtml(alternateHref)}"${autoLanguageAttribute}
>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="description" content="${escapeHtml(description)}" />
    <meta name="theme-color" content="#102028" />
    <meta property="og:type" content="article" />
    <meta property="og:site_name" content="REIST Research Token" />
    <meta property="og:title" content="${escapeHtml(pageTitle)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:url" content="${escapeHtml(canonicalUrl)}" />
    <title>${escapeHtml(pageTitle)}</title>
    <link rel="canonical" href="${escapeHtml(canonicalUrl)}" />
    <link rel="alternate" hreflang="de" href="${escapeHtml(germanUrl)}" />
    <link rel="alternate" hreflang="en" href="${escapeHtml(englishUrl)}" />
    <link rel="alternate" hreflang="x-default" href="${escapeHtml(xDefaultUrl)}" />
    <link rel="icon" href="${escapeHtml(markHref)}" type="image/svg+xml" />
    <script src="${escapeHtml(languageScriptHref)}"></script>
    <link rel="stylesheet" href="${escapeHtml(stylesheetHref)}" />
  </head>
  <body>
    <a class="skip-link" href="#dokument">${isEnglish ? "Skip to document" : "Zum Dokument"}</a>
    <header class="site-header document-header">
      <a class="brand" href="${escapeHtml(homeHref)}" aria-label="${escapeHtml(overviewLabel)}">
        <img src="${escapeHtml(markHref)}" width="42" height="42" alt="" />
        <span><strong>REIST</strong><small>${documentLabel}</small></span>
      </a>
      <nav class="document-nav" aria-label="${isEnglish ? "Document navigation" : "Dokumentnavigation"}">
        <a href="${escapeHtml(homeHref)}">${overviewLabel}</a>
        <a
          class="language-switch"
          data-language-switch
          data-language="${alternateLanguage}"
          href="${escapeHtml(`${alternateHref}?lang=${alternateLanguage}`)}"
          hreflang="${alternateLanguage}"
          aria-label="${escapeHtml(switchLabel)}"
        >${alternateLanguage.toUpperCase()}</a>
      </nav>
    </header>
    <main id="dokument" class="document-shell" tabindex="-1">
      <p class="section-label">${documentLabel}</p>
      <article class="markdown-document">
${rendered.content}
      </article>
    </main>
    <footer class="document-page-footer">
      <p><strong>REIST</strong> · ${documentLabel} · ${updatedLabel} <time datetime="2026-08-02">${isEnglish ? "2 August 2026" : "2. August 2026"}</time></p>
      <a href="${escapeHtml(homeHref)}">${overviewLabel}</a>
    </footer>
  </body>
</html>
`;
}

export function renderPublicDocuments(outputRoot) {
  for (const configuration of publicDocumentBuilds) {
    const rendered = renderMarkdown(configuration.source);
    const outputPath = resolve(outputRoot, configuration.target);
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, documentTemplate(configuration, rendered), "utf8");
  }
  console.log(`${publicDocumentBuilds.length} Markdown-Dokumente als HTML erzeugt.`);
}
