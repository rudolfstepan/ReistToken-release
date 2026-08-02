import { spawn } from "node:child_process";
import { publicDocumentBuilds } from "./lib/render-markdown.js";
import { PUBLIC_SITE_ORIGIN, publicSiteUrl } from "./lib/site-publication.js";

const port = 4174;
const origin = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ["scripts/serve-site.js"], {
  env: { ...process.env, REIST_SITE_PORT: String(port) },
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
});

let serverOutput = "";
child.stdout.on("data", (chunk) => {
  serverOutput += chunk.toString();
});
child.stderr.on("data", (chunk) => {
  serverOutput += chunk.toString();
});

async function waitForServer() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch(origin, { signal: AbortSignal.timeout(1_000) });
      if (response.ok) return response;
    } catch {
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
    }
  }
  throw new Error(`Website-Server nicht erreichbar. ${serverOutput}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

try {
  const home = await waitForServer();
  const html = await home.text();
  assert(html.includes("REIST Research Token"), "Projektidentität fehlt im HTML.");
  assert(
    home.headers.get("content-security-policy")?.includes("default-src 'self'"),
    "Content-Security-Policy fehlt."
  );
  assert(home.headers.get("x-frame-options") === "DENY", "Frame-Schutz fehlt.");
  assert(
    home.headers.get("permissions-policy")?.includes("camera=()"),
    "Permissions-Policy fehlt."
  );
  assert(
    html.includes(`<link rel="canonical" href="${PUBLIC_SITE_ORIGIN}/" />`),
    "Kanonische URL der deutschen Startseite fehlt."
  );

  const englishHome = await fetch(`${origin}/en/`);
  assert(englishHome.ok, "Englische Website ist nicht erreichbar.");
  const englishHtml = await englishHome.text();
  assert(englishHtml.includes('lang="en"'), "Englische Sprachkennung fehlt.");
  assert(
    englishHtml.includes("REIST Division — Project Documentation"),
    "Englische Projektidentität fehlt."
  );
  assert(
    englishHtml.includes('data-language="de"'),
    "Deutscher Sprachschalter fehlt in der englischen Fassung."
  );
  assert(
    englishHtml.includes(`<link rel="canonical" href="${PUBLIC_SITE_ORIGIN}/en/" />`),
    "Kanonische URL der englischen Startseite fehlt."
  );
  assert(
    html.includes('data-language="en"') && html.includes('data-auto-language="true"'),
    "Englischer Sprachschalter oder Browser-Sprachauswahl fehlt."
  );
  assert(!/href=["'][^"']+\.md(?:[?#][^"']*)?["']/i.test(html), "Deutsche Website verweist noch auf Markdown-Dateien.");
  assert(!/href=["'][^"']+\.md(?:[?#][^"']*)?["']/i.test(englishHtml), "Englische Website verweist noch auf Markdown-Dateien.");

  const languageScript = await fetch(`${origin}/language.js`);
  assert(languageScript.ok, "Sprachrouting-Skript ist nicht erreichbar.");
  const languageSource = await languageScript.text();
  assert(
    languageSource.includes("navigator.languages") &&
      languageSource.includes("reist-language"),
    "Sprachrouting berücksichtigt Browserwahl oder Persistenz nicht."
  );

  const project = await fetch(`${origin}/data/project.json`);
  assert(project.ok, "Projekt-JSON ist nicht erreichbar.");
  const projectData = await project.json();
  assert(projectData.token.symbol === "REIST", "Falsches Token-Symbol im Build.");
  assert(
    projectData.status.technicalTreasurySmoke === true &&
      projectData.status.fullTestnetSmoke === false,
    "Technischer und vollständiger Smoke-Status sind nicht sauber getrennt."
  );
  if (projectData.status.testnetDeployment) {
    assert(
      projectData.status.sourceVerified === true,
      "Deployment ist veroeffentlicht, aber die Quellcodeverifikation fehlt."
    );
    const deploymentResponse = await fetch(
      `${origin}/deployments/base-sepolia.json`
    );
    assert(
      deploymentResponse.ok,
      "Base-Sepolia-Deployment-Manifest ist nicht erreichbar."
    );
    const deployment = await deploymentResponse.json();
    assert(
      deployment.chainId === 84532 &&
        deployment.verification?.sourceVerified === true &&
        /^0x[a-fA-F0-9]{40}$/.test(deployment.contracts?.token || "") &&
        /^0x[a-fA-F0-9]{40}$/.test(
          deployment.contracts?.founderVesting || ""
        ) &&
        /^0x[a-fA-F0-9]{64}$/.test(deployment.transactionHash || ""),
      "Deployment-Manifest ist unvollstaendig oder nicht verifiziert."
    );
    assert(
      html.includes("deployed · Quellcode verifiziert") &&
        englishHtml.includes("deployed · source verified") &&
        html.includes("data-vesting-explorer-link") &&
        html.includes("data-transaction-explorer-link") &&
        englishHtml.includes("data-vesting-explorer-link") &&
        englishHtml.includes("data-transaction-explorer-link"),
      "DE/EN-Website zeigt den verifizierten Deployment-Stand nicht vollstaendig."
    );
  }

  const smokeResponse = await fetch(
    `${origin}/operations/base-sepolia-smoke-transfer.json`
  );
  assert(smokeResponse.ok, "Treasury-Operationsnachweis ist nicht erreichbar.");
  assert(
    smokeResponse.headers.get("content-type")?.startsWith("application/json"),
    "Treasury-Operationsnachweis wird nicht als JSON ausgeliefert."
  );
  const smokeOperation = await smokeResponse.json();
  assert(
    smokeOperation.status === "completed" &&
      smokeOperation.chainId === 84532 &&
      smokeOperation.amounts?.fundingWei === "5000000000000" &&
      smokeOperation.amounts?.tokenBaseUnits === "1000000000000000000" &&
      smokeOperation.transactions?.funding?.hash ===
        "0xe3f9e7265530e1cc3b8e636d98c038d416360aecd02a36b5e0549bcc9a2864af" &&
      smokeOperation.transactions?.tokenTransfer?.hash ===
        "0x308a8c07593179744c6a72b9d1992274282300064e9e31bf36cbbd18f2bdcde8" &&
      smokeOperation.economicValue === "none-promised-testnet-only",
    "Treasury-Operationsnachweis besitzt nicht den bestätigten Testnet-Stand."
  );
  assert(
    html.includes('href="operations/base-sepolia-smoke-transfer.json"') &&
      englishHtml.includes(
        'href="../operations/base-sepolia-smoke-transfer.json"'
      ),
    "DE/EN-Website verlinkt den Treasury-Operationsnachweis nicht."
  );

  const contributions = await fetch(`${origin}/data/contributions.json`);
  assert(contributions.ok, "Beitragsregister ist nicht erreichbar.");
  const contributionData = await contributions.json();
  assert(
    Array.isArray(contributionData.contributions),
    "Beitragsregister besitzt kein contributions-Array."
  );

  const contractSource = await fetch(`${origin}/contracts/REISTToken.sol`);
  assert(contractSource.ok, "Veröffentlichte Vertragsquelle ist nicht erreichbar.");
  assert(
    contractSource.headers.get("content-type")?.startsWith("text/plain"),
    "Solidity-Quelle wird nicht als Text ausgeliefert."
  );
  assert(
    (await contractSource.text()).includes("contract REISTToken"),
    "Veröffentlichte Vertragsquelle ist unvollständig."
  );

  const license = await fetch(`${origin}/LICENSE.txt`);
  assert(license.ok, "Veröffentlichte MIT-Lizenz ist nicht erreichbar.");
  assert(
    license.headers.get("content-type")?.startsWith("text/plain") &&
      (await license.text()).includes("MIT License"),
    "Veröffentlichte MIT-Lizenz ist unvollständig oder besitzt einen falschen MIME-Typ."
  );

  const legalNotice = await fetch(`${origin}/docs/rechtlicher-hinweis.html`);
  assert(legalNotice.ok, "Gerenderter deutscher Rechtshinweis ist nicht erreichbar.");
  const legalHtml = await legalNotice.text();
  assert(
    legalHtml.includes('lang="de"') && legalHtml.includes("kein MiCAR-Whitepaper"),
    "Gerenderter deutscher Rechtshinweis ist unvollständig."
  );
  assert(
    legalHtml.includes('data-language="en"') &&
      legalHtml.includes("../en/docs/legal-notice.html?lang=en"),
    "Sprachwechsel des deutschen Rechtshinweises ist fehlerhaft."
  );

  const englishLegalNotice = await fetch(`${origin}/en/docs/legal-notice.html`);
  assert(englishLegalNotice.ok, "Gerenderter englischer Rechtshinweis ist nicht erreichbar.");
  const englishLegalHtml = await englishLegalNotice.text();
  assert(
    englishLegalHtml.includes('lang="en"') &&
      englishLegalHtml.includes("not a MiCAR crypto-asset white paper"),
    "Gerenderter englischer Rechtshinweis ist unvollständig."
  );
  assert(
    englishLegalHtml.includes('data-language="de"') &&
      englishLegalHtml.includes("../../docs/rechtlicher-hinweis.html?lang=de"),
    "Sprachwechsel des englischen Rechtshinweises ist fehlerhaft."
  );

  const allocationDocument = await fetch(`${origin}/docs/token-und-verteilung.html`);
  assert(allocationDocument.ok, "Gerenderte Token-Dokumentation ist nicht erreichbar.");
  const allocationHtml = await allocationDocument.text();
  assert(
    allocationHtml.includes('class="document-table-wrap"') &&
      allocationHtml.includes("<table>"),
    "Markdown-Tabelle wurde nicht als responsive HTML-Tabelle gerendert."
  );
  assert(
    allocationHtml.includes(
      `<link rel="canonical" href="${publicSiteUrl("docs/token-und-verteilung.html")}" />`
    ),
    "Kanonische URL der gerenderten Dokumentseite fehlt."
  );

  const robotsResponse = await fetch(`${origin}/robots.txt`);
  assert(robotsResponse.ok, "robots.txt ist nicht erreichbar.");
  assert(
    robotsResponse.headers.get("content-type")?.startsWith("text/plain"),
    "robots.txt besitzt einen falschen MIME-Typ."
  );
  const robots = await robotsResponse.text();
  assert(
    robots.includes(`Sitemap: ${PUBLIC_SITE_ORIGIN}/sitemap.xml`),
    "robots.txt verweist nicht auf die öffentliche Sitemap."
  );

  const sitemapResponse = await fetch(`${origin}/sitemap.xml`);
  assert(sitemapResponse.ok, "sitemap.xml ist nicht erreichbar.");
  assert(
    sitemapResponse.headers.get("content-type")?.startsWith("application/xml"),
    "sitemap.xml besitzt einen falschen MIME-Typ."
  );
  const sitemap = await sitemapResponse.text();
  assert(
    (sitemap.match(/<url>/g) || []).length === publicDocumentBuilds.length + 2,
    "Sitemap enthält nicht alle öffentlichen DE/EN-Seiten."
  );
  for (const document of publicDocumentBuilds) {
    assert(
      sitemap.includes(`<loc>${publicSiteUrl(document.target)}</loc>`),
      `Sitemap enthält ${document.target} nicht.`
    );
  }

  for (const rawMarkdownPath of [
    "/README.md",
    "/SECURITY.md",
    "/docs/LEGAL_NOTICE.md",
    "/docs/en/LEGAL_NOTICE.md",
  ]) {
    const rawMarkdown = await fetch(`${origin}${rawMarkdownPath}`);
    assert(
      rawMarkdown.status === 404,
      `Rohe Markdown-Datei wird noch veröffentlicht: ${rawMarkdownPath}`
    );
  }

  const missing = await fetch(`${origin}/does-not-exist`);
  assert(missing.status === 404, "Fehlende Datei liefert nicht HTTP 404.");
  const missingHtml = await missing.text();
  assert(
    missingHtml.includes('name="robots" content="noindex,follow"') &&
      missingHtml.includes("404"),
    "Benutzerdefinierte 404-Seite fehlt oder darf indexiert werden."
  );

  const traversal = await fetch(`${origin}/%2e%2e%2fpackage.json`);
  assert(traversal.status === 403, "Pfadgrenzen des Website-Servers sind offen.");

  const unsupportedMethod = await fetch(origin, { method: "POST" });
  assert(
    unsupportedMethod.status === 405 &&
      unsupportedMethod.headers.get("allow") === "GET, HEAD",
    "Website-Server akzeptiert unerwartete HTTP-Methoden."
  );

  const malformedPath = await fetch(`${origin}/%zz`);
  assert(malformedPath.status === 400, "Ungültige URL-Kodierung wird nicht abgelehnt.");

  console.log(
    "Website-Smoke-Test erfolgreich: DE/EN, HTML-Dokumente, Sprachrouting, Daten, CSP und 404 geprüft."
  );
} finally {
  child.kill();
}
