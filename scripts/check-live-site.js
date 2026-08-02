import { publicDocumentBuilds } from "./lib/render-markdown.js";
import {
  CANONICAL_PAPER_DOI,
  CANONICAL_PAPER_URL,
  PUBLIC_RELEASE_REPOSITORY,
} from "./lib/project-identity.js";
import { PUBLIC_SITE_ORIGIN, publicSiteUrl } from "./lib/site-publication.js";

function fail(message) {
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function assertPublicProjectIdentity(check, label) {
  assert(
    check.body.includes(CANONICAL_PAPER_DOI) &&
      check.body.includes(`href="${CANONICAL_PAPER_URL}"`),
    `${label}: kanonischer Paper-DOI oder DOI-Link fehlt.`
  );
  assert(
    check.body.includes(`href="${PUBLIC_RELEASE_REPOSITORY}"`),
    `${label}: Link zum öffentlichen Release-Repository fehlt.`
  );
}

const requestedOrigin = process.argv[2] || PUBLIC_SITE_ORIGIN;
let originUrl;
try {
  originUrl = new URL(requestedOrigin);
} catch {
  fail("Live-Prüfung benötigt eine gültige HTTPS-Origin.");
}
if (
  originUrl.protocol !== "https:" ||
  originUrl.username ||
  originUrl.password ||
  originUrl.search ||
  originUrl.hash ||
  (originUrl.pathname !== "/" && originUrl.pathname !== "")
) {
  fail("Live-Prüfung akzeptiert nur eine HTTPS-Origin ohne Pfad oder Zugangsdaten.");
}
const origin = originUrl.origin;

async function request(path, options = {}) {
  const response = await fetch(new URL(path, `${origin}/`), {
    redirect: options.redirect || "follow",
    signal: AbortSignal.timeout(15_000),
  });
  const body = options.body === false ? "" : await response.text();
  return { body, response };
}

function assertStatus(check, expected, label) {
  assert(
    check.response.status === expected,
    `${label}: HTTP ${check.response.status} statt ${expected}.`
  );
}

function assertRedirect(check, expected, label) {
  assert(
    new Set([301, 308]).has(check.response.status),
    `${label}: permanente Weiterleitung fehlt.`
  );
  assert(
    check.response.headers.get("location") === expected,
    `${label}: falsches Redirect-Ziel ${check.response.headers.get("location")}.`
  );
}

function attributeValue(tag, name) {
  return tag.match(new RegExp(`\\b${name}=["']([^"']+)["']`, "i"))?.[1];
}

function hasLinkRelation(tag, relation) {
  return String(attributeValue(tag, "rel") || "")
    .toLowerCase()
    .split(/\s+/)
    .includes(relation);
}

function assertIndexableHtml(check, canonicalUrl, alternates, label) {
  assert(
    check.response.headers.get("content-type")?.startsWith("text/html"),
    `${label}: Content-Type ist nicht text/html.`
  );
  assert(
    !/(?:^|,)\s*noindex\b/i.test(
      check.response.headers.get("x-robots-tag") || ""
    ) &&
      !/\bnoindex\b/i.test(check.body),
    `${label}: indexierbare Seite ist als noindex markiert.`
  );

  const linkTags = [...check.body.matchAll(/<link\b[^>]*>/gi)].map(
    (match) => match[0]
  );
  const canonicals = linkTags
    .filter((tag) => hasLinkRelation(tag, "canonical"))
    .map((tag) => attributeValue(tag, "href"));
  assert(
    canonicals.length === 1 && canonicals[0] === canonicalUrl,
    `${label}: Canonical ist nicht genau einmal und korrekt gesetzt.`
  );

  const alternateTags = linkTags.filter(
    (tag) => hasLinkRelation(tag, "alternate") && attributeValue(tag, "hreflang")
  );
  assert(alternateTags.length === 3, `${label}: erwartet genau drei hreflang-Tags.`);
  const actualAlternates = new Map();
  for (const tag of alternateTags) {
    const language = attributeValue(tag, "hreflang").toLowerCase();
    assert(!actualAlternates.has(language), `${label}: doppeltes hreflang ${language}.`);
    actualAlternates.set(language, attributeValue(tag, "href"));
  }
  for (const [language, url] of Object.entries(alternates)) {
    assert(
      actualAlternates.get(language) === url,
      `${label}: hreflang ${language} ist falsch oder fehlt.`
    );
  }
}

const home = await request("/");
assertStatus(home, 200, "Deutsche Startseite");
assert(home.body.includes("REIST Research Token"), "Projektidentität fehlt live.");
assertPublicProjectIdentity(home, "Deutsche Startseite");
assertIndexableHtml(
  home,
  `${PUBLIC_SITE_ORIGIN}/`,
  {
    de: `${PUBLIC_SITE_ORIGIN}/`,
    en: `${PUBLIC_SITE_ORIGIN}/en/`,
    "x-default": `${PUBLIC_SITE_ORIGIN}/`,
  },
  "Deutsche Startseite"
);
assert(
  !/href=["'][^"']+\.md(?:[?#][^"']*)?["']/i.test(home.body),
  "Startseite verlinkt Markdown."
);

const headers = home.response.headers;
for (const [name, expected] of [
  ["content-security-policy", "default-src 'self'"],
  ["strict-transport-security", "max-age=31536000"],
  ["permissions-policy", "camera=()"],
]) {
  assert(
    headers.get(name)?.includes(expected),
    `Live-Header ${name} fehlt oder ist unvollständig.`
  );
}
assert(headers.get("x-content-type-options") === "nosniff", "Live-nosniff-Header fehlt.");
assert(headers.get("x-frame-options") === "DENY", "Live-Frame-Schutz ist nicht DENY.");
assert(
  headers.get("referrer-policy") === "no-referrer",
  "Live-Referrer-Policy ist nicht no-referrer."
);

const englishHome = await request("/en/");
assertStatus(englishHome, 200, "Englische Startseite");
assertPublicProjectIdentity(englishHome, "Englische Startseite");
assertIndexableHtml(
  englishHome,
  `${PUBLIC_SITE_ORIGIN}/en/`,
  {
    de: `${PUBLIC_SITE_ORIGIN}/`,
    en: `${PUBLIC_SITE_ORIGIN}/en/`,
    "x-default": `${PUBLIC_SITE_ORIGIN}/`,
  },
  "Englische Startseite"
);

const projectMetadata = await request("/data/project.json");
assertStatus(projectMetadata, 200, "Live-Projektmetadaten");
let liveProject;
try {
  liveProject = JSON.parse(projectMetadata.body);
} catch {
  fail("Live-Projektmetadaten sind kein gültiges JSON.");
}
assert(
  projectMetadata.response.headers
    .get("content-type")
    ?.startsWith("application/json"),
  "Live-Projektmetadaten besitzen nicht application/json."
);
assert(
  liveProject.framework?.publicPaper?.doi === CANONICAL_PAPER_DOI &&
    liveProject.framework?.publicPaper?.url === CANONICAL_PAPER_URL &&
    liveProject.framework?.tokenSourceRepository === PUBLIC_RELEASE_REPOSITORY &&
    liveProject.status?.technicalTreasurySmoke === true &&
    liveProject.status?.fullTestnetSmoke === false,
  "Live-Projektmetadaten enthalten nicht die kanonische Identität und den korrekten Smoke-Status."
);
assert(
  home.body.includes('href="operations/base-sepolia-smoke-transfer.json"') &&
    home.body.includes("verbleibender vollständiger Testnet-Smoke") &&
    englishHome.body.includes(
      'href="../operations/base-sepolia-smoke-transfer.json"'
    ) &&
    englishHome.body.includes("remaining full testnet smoke checks"),
  "Live-Startseiten trennen technischen und vollständigen Smoke-Status nicht."
);

const smokeOperationCheck = await request(
  "/operations/base-sepolia-smoke-transfer.json"
);
assertStatus(smokeOperationCheck, 200, "Treasury-Operationsnachweis");
assert(
  smokeOperationCheck.response.headers
    .get("content-type")
    ?.startsWith("application/json"),
  "Treasury-Operationsnachweis besitzt nicht application/json."
);
let liveSmokeOperation;
try {
  liveSmokeOperation = JSON.parse(smokeOperationCheck.body);
} catch {
  fail("Treasury-Operationsnachweis ist kein gültiges JSON.");
}
assert(
  liveSmokeOperation.status === "completed" &&
    liveSmokeOperation.chainId === 84532 &&
    liveSmokeOperation.transactions?.funding?.hash ===
      "0xe3f9e7265530e1cc3b8e636d98c038d416360aecd02a36b5e0549bcc9a2864af" &&
    liveSmokeOperation.transactions?.tokenTransfer?.hash ===
      "0x308a8c07593179744c6a72b9d1992274282300064e9e31bf36cbbd18f2bdcde8" &&
    liveSmokeOperation.economicValue === "none-promised-testnet-only",
  "Live-Treasury-Operationsnachweis besitzt nicht den bestätigten Stand."
);

for (const document of publicDocumentBuilds) {
  const check = await request(`/${document.target}`);
  assertStatus(check, 200, document.target);
  assert(
    check.body.includes(`lang="${document.language}"`),
    `${document.target}: falsche Dokumentsprache.`
  );
  const alternateUrl = publicSiteUrl(document.alternate);
  const germanUrl = document.language === "de"
    ? publicSiteUrl(document.target)
    : alternateUrl;
  const englishUrl = document.language === "en"
    ? publicSiteUrl(document.target)
    : alternateUrl;
  assertIndexableHtml(
    check,
    publicSiteUrl(document.target),
    {
      de: germanUrl,
      en: englishUrl,
      "x-default": publicSiteUrl(document.xDefault),
    },
    document.target
  );
  assert(
    !/href=["'][^"']+\.md(?:[?#][^"']*)?["']/i.test(check.body),
    `${document.target}: rohe Markdown-Verknüpfung gefunden.`
  );
}

const robots = await request("/robots.txt");
assertStatus(robots, 200, "robots.txt");
assert(
  robots.response.headers.get("content-type")?.startsWith("text/plain"),
  "robots.txt besitzt nicht text/plain."
);
assert(
  robots.body.includes(`Sitemap: ${PUBLIC_SITE_ORIGIN}/sitemap.xml`),
  "robots.txt enthält nicht die kanonische Sitemap."
);
assert(/^Allow:\s*\/$/m.test(robots.body), "robots.txt erlaubt den öffentlichen Crawl nicht.");
assert(!/^Disallow:/mi.test(robots.body), "robots.txt enthält eine unerwartete Crawling-Sperre.");

const sitemap = await request("/sitemap.xml");
assertStatus(sitemap, 200, "sitemap.xml");
const sitemapContentType = sitemap.response.headers.get("content-type") || "(fehlt)";
assert(
  sitemapContentType.startsWith("application/xml"),
  `sitemap.xml besitzt nicht application/xml (empfangen: ${sitemapContentType}).`
);
assert(
  (sitemap.body.match(/<url>/g) || []).length === publicDocumentBuilds.length + 2,
  "sitemap.xml enthält nicht genau zwölf öffentliche Seiten."
);
assert(
  sitemap.body.includes('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"') &&
    sitemap.body.includes('xmlns:xhtml="http://www.w3.org/1999/xhtml"'),
  "sitemap.xml enthält nicht beide erforderlichen Namespaces."
);
const sitemapBlocks = [...sitemap.body.matchAll(/<url>([\s\S]*?)<\/url>/g)].map(
  (match) => match[1]
);
const sitemapPairs = [
  { de: "", en: "en/" },
  ...publicDocumentBuilds
    .filter((document) => document.language === "de")
    .map((document) => ({ de: document.target, en: document.alternate })),
];
for (const pair of sitemapPairs) {
  const alternates = {
    de: publicSiteUrl(pair.de),
    en: publicSiteUrl(pair.en),
    "x-default": publicSiteUrl(pair.de),
  };
  for (const target of [pair.de, pair.en]) {
    const location = publicSiteUrl(target);
    const matchingBlocks = sitemapBlocks.filter((block) =>
      block.includes(`<loc>${location}</loc>`)
    );
    assert(matchingBlocks.length === 1, `sitemap.xml: ${location} fehlt oder ist doppelt.`);
    for (const [language, url] of Object.entries(alternates)) {
      assert(
        matchingBlocks[0].includes(
          `rel="alternate" hreflang="${language}" href="${url}"`
        ),
        `sitemap.xml: ${location} besitzt kein korrektes hreflang ${language}.`
      );
    }
  }
}

for (const [path, type, marker, noindex] of [
  ["/assets/reist-mark.svg", "image/svg+xml", "<svg", false],
  ["/app.js", "application/javascript", "bounties.json", false],
  ["/language.js", "application/javascript", "navigator.languages", false],
  ["/styles.css", "text/css", "--accent", false],
  ["/data/project.json", "application/json", "REIST Research Token", true],
  ["/data/bounties.json", "application/json", '"bounties"', true],
  ["/contracts/REISTToken.sol", "text/plain", "contract REISTToken", true],
  ["/LICENSE.txt", "text/plain", "MIT License", true],
]) {
  const check = await request(path);
  assertStatus(check, 200, path);
  assert(
    check.response.headers.get("content-type")?.startsWith(type),
    `${path}: falscher MIME-Typ.`
  );
  assert(check.body.includes(marker), `${path}: erwarteter Inhalt fehlt.`);
  if (noindex) {
    assert(
      check.response.headers.get("x-robots-tag") === "noindex",
      `${path}: X-Robots-Tag noindex fehlt.`
    );
  }
}

for (const rawMarkdownPath of [
  "/README.md",
  "/SECURITY.md",
  "/docs/LEGAL_NOTICE.md",
  "/docs/en/LEGAL_NOTICE.md",
]) {
  assertStatus(await request(rawMarkdownPath), 404, rawMarkdownPath);
}

const missing = await request("/__reist_missing_live_check__");
assertStatus(missing, 404, "Unbekannte URL");
assert(
  missing.response.headers.get("content-type")?.startsWith("text/html"),
  "Live-404-Antwort besitzt nicht text/html."
);
assert(
  missing.body.includes('name="robots" content="noindex,follow"'),
  "Live-404-Seite fehlt oder darf indexiert werden."
);
assert(
  missing.response.headers.get("content-security-policy")?.includes("default-src 'self'"),
  "Live-404-Antwort besitzt keine CSP."
);

assertRedirect(
  await request("/index.html", { redirect: "manual", body: false }),
  `${PUBLIC_SITE_ORIGIN}/`,
  "/index.html"
);
assertRedirect(
  await request("/en/index.html", { redirect: "manual", body: false }),
  `${PUBLIC_SITE_ORIGIN}/en/`,
  "/en/index.html"
);

if (origin === PUBLIC_SITE_ORIGIN) {
  const httpUrl = new URL(origin);
  httpUrl.protocol = "http:";
  const httpRedirect = await fetch(httpUrl, {
    redirect: "manual",
    signal: AbortSignal.timeout(15_000),
  });
  assertRedirect(
    { body: "", response: httpRedirect },
    `${PUBLIC_SITE_ORIGIN}/`,
    "HTTP zu HTTPS"
  );
  const aliasRedirect = await fetch("https://reisttoken.intracom.at/", {
    redirect: "manual",
    signal: AbortSignal.timeout(15_000),
  });
  assertRedirect(
    { body: "", response: aliasRedirect },
    `${PUBLIC_SITE_ORIGIN}/`,
    "Alias-Host"
  );
}

console.log(
  `Live-Prüfung erfolgreich: ${origin}, 12 Seiten, Redirects, 404, MIME-Typen und Sicherheitsheader.`
);
