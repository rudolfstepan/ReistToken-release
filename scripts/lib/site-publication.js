import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

export const PUBLIC_SITE_ORIGIN = "https://reist-token.intracom.at";

function fail(message) {
  throw new Error(message);
}

function xmlEscape(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function normalizedPublicPath(path) {
  const value = String(path || "").replace(/^\/+/, "");
  const segments = value.split("/").filter(Boolean);
  if (
    /[?#\u0000-\u001f\u007f]/u.test(value) ||
    value.includes("\\") ||
    value.includes("//") ||
    segments.some((part) => part === "." || part === "..") ||
    !/^[A-Za-z0-9._/-]*$/.test(value)
  ) {
    fail(`Unsicherer öffentlicher Pfad: ${path}`);
  }
  return value ? `/${value}` : "/";
}

export function publicSiteUrl(path = "") {
  return `${PUBLIC_SITE_ORIGIN}${normalizedPublicPath(path)}`;
}

function sitemapEntry(path, pair, lastUpdated) {
  const location = publicSiteUrl(path);
  const german = publicSiteUrl(pair.de);
  const english = publicSiteUrl(pair.en);
  return `  <url>
    <loc>${xmlEscape(location)}</loc>
    <xhtml:link rel="alternate" hreflang="de" href="${xmlEscape(german)}" />
    <xhtml:link rel="alternate" hreflang="en" href="${xmlEscape(english)}" />
    <xhtml:link rel="alternate" hreflang="x-default" href="${xmlEscape(german)}" />
    <lastmod>${xmlEscape(lastUpdated)}</lastmod>
  </url>`;
}

export function writeDiscoveryFiles(outputRoot, publicDocuments, lastUpdated) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(lastUpdated)) {
    fail("Sitemap benötigt ein Veröffentlichungsdatum im Format YYYY-MM-DD.");
  }

  const documentPairs = publicDocuments
    .filter((document) => document.language === "de")
    .map((document) => ({ de: document.target, en: document.alternate }));
  const pagePairs = [{ de: "", en: "en/" }, ...documentPairs];
  const entries = pagePairs.flatMap((pair) => [
    sitemapEntry(pair.de, pair, lastUpdated),
    sitemapEntry(pair.en, pair, lastUpdated),
  ]);
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${entries.join("\n")}
</urlset>
`;
  const robots = `User-agent: *
Allow: /

Sitemap: ${publicSiteUrl("sitemap.xml")}
`;

  writeFileSync(resolve(outputRoot, "sitemap.xml"), sitemap, "utf8");
  writeFileSync(resolve(outputRoot, "robots.txt"), robots, "utf8");
  console.log(`${entries.length} öffentliche URLs in sitemap.xml eingetragen.`);
}
