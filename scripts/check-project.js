import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { getAddress, ZeroAddress } from "ethers";
import { canonicalJsonSha256 } from "./lib/build-provenance.js";
import {
  validateCompletedAllowanceEvidence,
  validatePreparedAllowancePlan,
} from "./lib/base-sepolia-allowance-plan.js";
import { publicDocumentBuilds } from "./lib/render-markdown.js";
import { PUBLIC_SITE_ORIGIN, publicSiteUrl } from "./lib/site-publication.js";
import {
  createIsolatedGitEnvironment,
  normalizePublicRepositoryUrl,
  remoteReferencesContainCommit,
} from "./lib/repository-provenance.js";
import {
  CANONICAL_PAPER_DOI,
  CANONICAL_PAPER_URL,
  FPGA_SOURCE_COMMIT,
  FPGA_SOURCE_REPOSITORY,
  FPGA_SOURCE_SNAPSHOT_URL,
  PUBLIC_RELEASE_REPOSITORY,
} from "./lib/project-identity.js";

const root = resolve(".");
const excludedDirectories = new Set([
  ".agents",
  ".codex",
  ".git",
  "artifacts",
  "cache",
  "coverage",
  "dist",
  "keystore",
  "keystores",
  "node_modules",
  "secrets",
  "typechain-types",
  "types",
  "wallets",
]);
const textExtensions = new Set([
  ".conf",
  ".css",
  ".html",
  ".js",
  ".json",
  ".md",
  ".sol",
  ".svg",
  ".yml",
  ".yaml",
]);

function fail(message) {
  throw new Error(message);
}

function readJson(path) {
  return JSON.parse(readFileSync(resolve(path), "utf8"));
}

function isIsoCalendarDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function isIsoInstant(value) {
  if (typeof value !== "string") return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
}

function validateActiveBounty(bounty, researchTreasuryAddress) {
  const expectedIssuePrefix = `${PUBLIC_RELEASE_REPOSITORY}/issues/`;
  if (
    typeof bounty.issueUrl !== "string" ||
    !bounty.issueUrl.startsWith(expectedIssuePrefix) ||
    !/^[1-9]\d*$/.test(bounty.issueUrl.slice(expectedIssuePrefix.length))
  ) {
    fail(`Aktives Bounty ohne kanonisches öffentliches Issue: ${bounty.id}`);
  }
  if (
    typeof bounty.reviewer !== "string" ||
    !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(
      bounty.reviewer
    ) ||
    bounty.reviewer.includes("--")
  ) {
    fail(`Aktives Bounty ohne gültigen Reviewer: ${bounty.id}`);
  }
  if (
    bounty.deadline !== "open" &&
    !isIsoCalendarDate(bounty.deadline)
  ) {
    fail(`Aktives Bounty ohne gültige Frist: ${bounty.id}`);
  }
  if (!isIsoCalendarDate(bounty.activatedAt)) {
    fail(`Aktives Bounty ohne Aktivierungsdatum: ${bounty.id}`);
  }
  if (bounty.deadline !== "open" && bounty.deadline < bounty.activatedAt) {
    fail(`Aktives Bounty endet vor seinem Aktivierungsdatum: ${bounty.id}`);
  }
  if (bounty.token !== "testnet REIST") {
    fail(`Aktives Bounty verwendet nicht testnet REIST: ${bounty.id}`);
  }
  let treasuryAddress;
  try {
    treasuryAddress = getAddress(bounty.treasuryAddress);
  } catch {
    fail(`Aktives Bounty ohne gültige Treasury-Adresse: ${bounty.id}`);
  }
  if (
    treasuryAddress === ZeroAddress ||
    treasuryAddress !== researchTreasuryAddress
  ) {
    fail(`Aktives Bounty verwendet nicht die öffentliche Research-Treasury: ${bounty.id}`);
  }
}

function collectFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory)) {
    if (excludedDirectories.has(entry)) continue;
    const fullPath = join(directory, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) files.push(...collectFiles(fullPath));
    else files.push(fullPath);
  }
  return files;
}

const requiredFiles = [
  "CONTRIBUTING.md",
  "contracts/REISTToken.sol",
  "contracts/REISTFounderVesting.sol",
  "test/REISTToken.js",
  "scripts/deploy-reist.js",
  "scripts/check-language.js",
  "scripts/check-live-site.js",
  "scripts/check-testnet-config.js",
  "scripts/check-testnet-recovery.js",
  "scripts/backup-testnet-wallets.ps1",
  "scripts/check-testnet-acl.ps1",
  "scripts/check-testnet-recovery.ps1",
  "scripts/configure-etherscan-api-key.ps1",
  "scripts/deploy-testnet.js",
  "scripts/deploy-testnet.ps1",
  "scripts/check-base-sepolia-allowance-smoke.js",
  "scripts/execute-base-sepolia-allowance-smoke.js",
  "scripts/execute-base-sepolia-allowance-smoke.ps1",
  "scripts/execute-base-sepolia-smoke.js",
  "scripts/execute-base-sepolia-smoke.ps1",
  "scripts/estimate-testnet-deployment.js",
  "scripts/export-testnet-addresses.js",
  "scripts/setup-testnet-wallets.js",
  "scripts/setup-testnet-wallets.ps1",
  "scripts/lib/build-provenance.js",
  "scripts/lib/base-sepolia-allowance-plan.js",
  "scripts/lib/base-sepolia-smoke-plan.js",
  "scripts/lib/password-transport.js",
  "scripts/lib/project-identity.js",
  "scripts/lib/repository-provenance.js",
  "scripts/lib/render-markdown.js",
  "scripts/lib/site-publication.js",
  "scripts/tests/base-sepolia-smoke-plan.test.js",
  "scripts/tests/base-sepolia-allowance-plan.test.js",
  "scripts/smoke-site.js",
  "plans/README.md",
  "plans/base-sepolia-allowance-smoke.json",
  "operations/README.md",
  "operations/base-sepolia-allowance-roundtrip.json",
  "operations/base-sepolia-smoke-transfer.json",
  "docs/SCIENTIFIC_BASIS.md",
  "docs/PROJECT_STATUS.md",
  "docs/TOKENOMICS.md",
  "docs/BOUNTIES.md",
  "docs/LEGAL_NOTICE.md",
  "docs/PUBLIC_RELEASE.md",
  "docs/WEBSITE_DEPLOYMENT.md",
  "docs/en/TOKEN_AND_ALLOCATION.md",
  "docs/en/RISKS.md",
  "docs/en/LEGAL_NOTICE.md",
  "docs/en/SECURITY.md",
  "docs/en/TRADEMARKS.md",
  "data/project.json",
  "data/testnet-roles.json",
  "data/bounties.json",
  "data/contributions.json",
  "site/index.html",
  "site/404.html",
  "site/en/index.html",
  "site/styles.css",
  "site/app.js",
  "site/language.js",
  ".github/ISSUE_TEMPLATE/config.yml",
  ".github/ISSUE_TEMPLATE/bug-report.yml",
  ".github/ISSUE_TEMPLATE/research-proposal.yml",
];

for (const path of requiredFiles) {
  if (!existsSync(resolve(path))) fail(`Pflichtdatei fehlt: ${path}`);
}

const repositoryUrlCases = new Map([
  [
    "https://github.com/rudolfstepan/reist-research-token.git",
    "https://github.com/rudolfstepan/reist-research-token",
  ],
  [
    "git@github.com:rudolfstepan/reist-research-token.git",
    "https://github.com/rudolfstepan/reist-research-token",
  ],
  [
    "ssh://git@github.com/rudolfstepan/reist-research-token.git",
    "https://github.com/rudolfstepan/reist-research-token",
  ],
]);
for (const [input, expected] of repositoryUrlCases) {
  if (normalizePublicRepositoryUrl(input) !== expected) {
    fail(`Repository-URL wird nicht kanonisch normalisiert: ${input}`);
  }
}
for (const rejected of [
  "http://github.com/rudolfstepan/reist",
  "https://user:token@github.com/rudolfstepan/reist",
  "https://github.com/rudolfstepan/reist?token=secret",
  "file:///tmp/reist",
  "https://127.0.0.1/rudolfstepan/reist",
  "git@10.0.0.1:rudolfstepan/reist.git",
  "https://[fc00::1]/rudolfstepan/reist",
  "https://git.localhost/rudolfstepan/reist",
  "https://localhost./rudolfstepan/reist",
  "git@localhost.:rudolfstepan/reist.git",
  "https://git.local./rudolfstepan/reist",
  "https://research.home.arpa/rudolfstepan/reist",
  "https://research.onion/rudolfstepan/reist",
  "ssh://owner@github.com/rudolfstepan/reist",
]) {
  let accepted = false;
  try {
    normalizePublicRepositoryUrl(rejected);
    accepted = true;
  } catch {
    // Erwartete Ablehnung.
  }
  if (accepted) fail(`Unsicherer Repository-Remote wurde akzeptiert: ${rejected}`);
}
const publishedCommit = "a".repeat(40);
if (
  !remoteReferencesContainCommit(
    `${publishedCommit}\trefs/heads/main\n${"b".repeat(40)}\trefs/tags/v0.1.0`,
    publishedCommit
  ) ||
  remoteReferencesContainCommit(
    `${"b".repeat(40)}\trefs/heads/main`,
    publishedCommit
  )
) {
  fail("Öffentliche Git-Referenzen werden nicht korrekt an den Commit gebunden.");
}

const hostileGitEnvironment = {
  KEEP_FOR_PROVENANCE_TEST: "preserved",
  GCM_INTERACTIVE: "Always",
  GIT_ASKPASS: "credential-prompt",
  GIT_CONFIG_COUNT: "1",
  GIT_CONFIG_KEY_0: "url.ssh://git@example.invalid/.insteadOf",
  GIT_CONFIG_VALUE_0: "https://example.com/",
  GIT_DIR: "inherited-repository",
  GIT_SSH_COMMAND: "credential-bearing-ssh-command",
  HOME: "credential-home",
  HOMEDRIVE: "C:",
  HOMEPATH: "\\credential-home",
  NETRC: "credential-home/.netrc",
  SSH_AGENT_PID: "1234",
  SSH_ASKPASS: "ssh-prompt",
  SSH_AUTH_SOCK: "agent-socket",
  USERPROFILE: "credential-profile",
  XDG_CONFIG_HOME: "credential-xdg-home",
  git_config_parameters: "'url.file:///private/.insteadOf'='https://'",
};
const isolatedGitEnvironment = createIsolatedGitEnvironment(
  "neutral/empty.gitconfig",
  "neutral/workdir",
  hostileGitEnvironment
);
const expectedIsolatedGitVariables = new Map([
  ["GCM_INTERACTIVE", "Never"],
  ["GIT_CEILING_DIRECTORIES", "neutral/workdir"],
  ["GIT_CONFIG_GLOBAL", "neutral/empty.gitconfig"],
  ["GIT_CONFIG_NOSYSTEM", "1"],
  ["GIT_SSL_NO_VERIFY", "0"],
  ["GIT_TERMINAL_PROMPT", "0"],
]);
for (const [key, expected] of expectedIsolatedGitVariables) {
  if (isolatedGitEnvironment[key] !== expected) {
    fail(`Isolierte Git-Umgebung setzt ${key} nicht sicher.`);
  }
}
if (isolatedGitEnvironment.KEEP_FOR_PROVENANCE_TEST !== "preserved") {
  fail("Isolierte Git-Umgebung verwirft unkritische Prozessvariablen.");
}
const allowedGitEnvironmentKeys = new Set(expectedIsolatedGitVariables.keys());
const forbiddenCredentialEnvironmentKeys = new Set([
  "HOME",
  "HOMEDRIVE",
  "HOMEPATH",
  "NETRC",
  "USERPROFILE",
  "XDG_CONFIG_HOME",
]);
for (const key of Object.keys(isolatedGitEnvironment)) {
  const normalizedKey = key.toUpperCase();
  if (
    ((normalizedKey.startsWith("GIT_") ||
      normalizedKey.startsWith("GCM_") ||
      normalizedKey.startsWith("SSH_")) &&
      !allowedGitEnvironmentKeys.has(normalizedKey)) ||
    forbiddenCredentialEnvironmentKeys.has(normalizedKey)
  ) {
    fail(`Isolierte Git-Umgebung übernimmt unsichere Variable: ${key}`);
  }
}

const obsoletePlaceholderNames = new RegExp(
  `\\b(${["my", "coin"].join("")}|${["my", "c"].join("")})\\b`,
  "i"
);

for (const file of collectFiles(root)) {
  if (!textExtensions.has(extname(file).toLowerCase())) continue;
  if (file.endsWith("package-lock.json")) continue;
  const content = readFileSync(file, "utf8");
  if (obsoletePlaceholderNames.test(content)) {
    fail(`Veraltete Platzhalterbezeichnung in ${relative(root, file)}`);
  }
}

const project = readJson("data/project.json");
const testnetRoles = readJson("data/testnet-roles.json");
const projectPackage = readJson("package.json");
const preparedAllowancePlan = readJson(
  "plans/base-sepolia-allowance-smoke.json"
);
validatePreparedAllowancePlan(preparedAllowancePlan);
const completedAllowanceEvidence = readJson(
  "operations/base-sepolia-allowance-roundtrip.json"
);
validateCompletedAllowanceEvidence(completedAllowanceEvidence);
const allowancePrecheckSource = readFileSync(
  resolve("scripts/check-base-sepolia-allowance-smoke.js"),
  "utf8"
);
for (const forbidden of [
  "Wallet",
  "signTransaction",
  "broadcastTransaction",
  "sendTransaction",
  "readPasswordFromStandardInput",
  "eth_sendRawTransaction",
]) {
  if (allowancePrecheckSource.includes(forbidden)) {
    fail(`Read-only-Allowance-Precheck enthält verbotene Sendefähigkeit: ${forbidden}.`);
  }
}
const fundedTestnetStatus =
  "wallets-created-recovery-checked-funded-not-deployed";
const deployedTestnetStatus = "base-sepolia-pilot-deployed-no-economic-value";
const fundingSnapshot = testnetRoles.fundingSnapshot;
if (
  testnetRoles.schemaVersion !== 1 ||
  testnetRoles.network !== "Base Sepolia" ||
  testnetRoles.chainId !== 84532 ||
  !new Set([fundedTestnetStatus, deployedTestnetStatus]).has(
    testnetRoles.status
  ) ||
  !isIsoInstant(testnetRoles.createdAt) ||
  !isIsoInstant(testnetRoles.recoveryCheckedAt) ||
  !isIsoInstant(testnetRoles.backupRecoveryCheckedAt) ||
  !isIsoInstant(fundingSnapshot?.checkedAt) ||
  testnetRoles.recoveryCheckedAt < testnetRoles.createdAt ||
  testnetRoles.backupRecoveryCheckedAt < testnetRoles.recoveryCheckedAt ||
  fundingSnapshot.checkedAt < testnetRoles.backupRecoveryCheckedAt ||
  !Number.isSafeInteger(fundingSnapshot.blockNumber) ||
  fundingSnapshot.blockNumber <= 0 ||
  !/^[1-9]\d*$/.test(fundingSnapshot.deployerBalanceWei || "") ||
  testnetRoles.custody?.multisig !== false ||
  testnetRoles.custody?.mainnetSuitable !== false
) {
  fail("Öffentliches Testnet-Rollenregister besitzt einen falschen Status.");
}
const requiredTestnetRoleNames = [
  "deployer",
  "founderBeneficiary",
  "researchRewardsTreasury",
  "ecosystemTreasury",
];
const publicTestnetRoles = testnetRoles.roles;
if (
  !publicTestnetRoles ||
  typeof publicTestnetRoles !== "object" ||
  Array.isArray(publicTestnetRoles) ||
  Object.keys(publicTestnetRoles).sort().join("\n") !==
    [...requiredTestnetRoleNames].sort().join("\n")
) {
  fail("Öffentliches Testnet-Rollenregister besitzt nicht die vier Pflichtrollen.");
}
const publicTestnetAddresses = requiredTestnetRoleNames.map(
  (roleName) => publicTestnetRoles[roleName]
);
const normalizedTestnetAddresses = publicTestnetAddresses.map((address) => {
  try {
    const normalized = getAddress(address);
    if (normalized === ZeroAddress) fail("Testnet-Rolle darf keine Nulladresse sein.");
    return normalized.toLowerCase();
  } catch {
    fail("Öffentliches Testnet-Rollenregister enthält eine ungültige Adresse.");
  }
});
if (new Set(normalizedTestnetAddresses).size !== 4) {
  fail("Öffentliche Testnet-Rollenadressen müssen paarweise verschieden sein.");
}
const researchTreasuryAddress = getAddress(
  publicTestnetRoles.researchRewardsTreasury
);
const expectedPaperHash =
  "369B9FB75C1B6D4C2CBBA91FF63DB4420900AB30B6EEC137BFD72290AE7D45C4";
if (
  project.framework?.publicPaper?.doi !== CANONICAL_PAPER_DOI ||
  project.framework?.publicPaper?.url !== CANONICAL_PAPER_URL ||
  project.framework?.publicPaper?.zenodoRecord !==
    "https://zenodo.org/records/21206471" ||
  project.framework?.publicPaper?.publicationDate !== "2026-07-05" ||
  project.framework?.publicPaper?.license !== "CC-BY-4.0" ||
  project.framework?.publicPaper?.sha256 !== expectedPaperHash
) {
  fail("Projekt-JSON enthält nicht die freigegebene kanonische Paper-Version.");
}
if (
  project.framework?.previousPublicVersion?.doi !==
    "10.5281/zenodo.17897540" ||
  project.framework?.previousPublicVersion?.relationFromCanonical !==
    "isNewVersionOf"
) {
  fail("Projekt-JSON enthält nicht die dokumentierte Zenodo-Vorgängerbeziehung.");
}
if (project.framework?.tokenSourceRepository !== PUBLIC_RELEASE_REPOSITORY) {
  fail("Projekt-JSON verweist nicht auf das kanonische öffentliche Release-Repository.");
}
const fpgaImplementation = project.framework?.fpgaImplementation;
if (
  fpgaImplementation?.repository !== FPGA_SOURCE_REPOSITORY ||
  fpgaImplementation?.sourceCommit !== FPGA_SOURCE_COMMIT ||
  fpgaImplementation?.sourceSnapshot !== FPGA_SOURCE_SNAPSHOT_URL ||
  fpgaImplementation?.target !== "Tang Primer 20K / Gowin GW2A-18" ||
  fpgaImplementation?.publicReistSourceFiles !== true ||
  fpgaImplementation?.localGhdlTestsPassing !== true ||
  fpgaImplementation?.verifiedAt !== "2026-08-02" ||
  fpgaImplementation?.independentHardwareReproduction !== false ||
  fpgaImplementation?.explicitRepositoryLicense !== false
) {
  fail("Projekt-JSON bildet den geprüften FPGA-Quellstatus nicht korrekt ab.");
}
if (
  projectPackage.repository?.url !== `${PUBLIC_RELEASE_REPOSITORY}.git` ||
  projectPackage.bugs?.url !== `${PUBLIC_RELEASE_REPOSITORY}/issues`
) {
  fail("package.json verweist nicht konsistent auf das öffentliche Release-Repository.");
}
const environmentExample = readFileSync(resolve(".env.example"), "utf8");
if (!environmentExample.includes(`REIST_PAPER_DOI=${CANONICAL_PAPER_DOI}`)) {
  fail(".env.example enthält nicht die freigegebene kanonische Paper-DOI.");
}
const allocations = project.token.allocations;
const totalAmount = allocations.reduce(
  (sum, allocation) => sum + BigInt(allocation.amount),
  0n
);
const totalPercentage = allocations.reduce(
  (sum, allocation) => sum + allocation.percentage,
  0
);

if (totalAmount !== BigInt(project.token.totalSupply)) {
  fail("Projekt-JSON: Zuteilungen ergeben nicht die Gesamtmenge.");
}
if (totalPercentage !== 100) {
  fail("Projekt-JSON: Zuteilungsprozente ergeben nicht 100.");
}
if (
  project.status.mainnetDeployment !== false ||
  project.status.publicReistFpgaSources !== true ||
  project.status.independentFpgaReproduction !== false ||
  project.status.technicalTreasurySmoke !== true ||
  project.status.allowanceTestPrepared !== true ||
  project.status.allowanceTestCompleted !== true ||
  project.status.fullTestnetSmoke !== false ||
  project.status.externalAudit !== false ||
  project.status.activeBounties !== 0 ||
  project.status.acceptedContributions !== 0
) {
  fail("Projektstatus bildet die abgeschlossenen und offenen Gates nicht korrekt ab.");
}

const bountyData = readJson("data/bounties.json");
if (
  bountyData.schemaVersion !== 1 ||
  bountyData.network !== "Base Sepolia" ||
  !Array.isArray(bountyData.bounties)
) {
  fail("Bounty-Register besitzt ein ungültiges Schema oder Netzwerk.");
}

const activeBountyFixture = {
  id: "REIST-VALIDATION-FIXTURE",
  status: "active",
  reward: "1",
  token: "testnet REIST",
  issueUrl: `${PUBLIC_RELEASE_REPOSITORY}/issues/1`,
  reviewer: "reist-reviewer",
  deadline: "open",
  activatedAt: "2026-08-02",
  treasuryAddress: researchTreasuryAddress,
};
validateActiveBounty(activeBountyFixture, researchTreasuryAddress);
for (const [description, changes] of [
  ["Issue-Nummer null", { issueUrl: `${PUBLIC_RELEASE_REPOSITORY}/issues/0` }],
  ["Reviewer mit Doppelbindestrich", { reviewer: "reist--reviewer" }],
  ["unmögliches Datum", { activatedAt: "2026-99-99" }],
  ["Frist vor Aktivierung", { deadline: "2026-08-01" }],
  ["falsche Tokenbezeichnung", { token: "REIST" }],
  ["falsche Treasury", { treasuryAddress: ZeroAddress }],
]) {
  let rejected = false;
  try {
    validateActiveBounty(
      { ...activeBountyFixture, ...changes },
      researchTreasuryAddress
    );
  } catch {
    rejected = true;
  }
  if (!rejected) fail(`Aktive-Bounty-Prüfung akzeptiert ${description}.`);
}

const bountyIds = new Set();
let activeBountyCount = 0;
for (const bounty of bountyData.bounties) {
  if (bountyIds.has(bounty.id)) fail(`Doppelte Bounty-ID: ${bounty.id}`);
  bountyIds.add(bounty.id);
  if (!new Set(["draft", "active", "closed", "cancelled"]).has(bounty.status)) {
    fail(`Ungültiger Bounty-Status: ${bounty.id}`);
  }
  if (BigInt(bounty.reward) <= 0n) fail(`Ungültige Bounty-Prämie: ${bounty.id}`);
  if (bounty.status === "active") {
    validateActiveBounty(bounty, researchTreasuryAddress);
    activeBountyCount += 1;
  }
}
if (project.status.activeBounties !== activeBountyCount) {
  fail("Projektstatus und Bounty-Datei melden verschiedene aktive Bounties.");
}

const contributionData = readJson("data/contributions.json");
if (!Array.isArray(contributionData.contributions)) {
  fail("Beitragsregister muss ein contributions-Array enthalten.");
}
const contributionIds = new Set();
for (const contribution of contributionData.contributions) {
  if (contributionIds.has(contribution.id)) {
    fail(`Doppelte Beitrags-ID: ${contribution.id}`);
  }
  contributionIds.add(contribution.id);
  if (!bountyIds.has(contribution.bountyId)) {
    fail(`Beitrag verweist auf unbekanntes Bounty: ${contribution.id}`);
  }
  if (!/^0x[a-fA-F0-9]{64}$/.test(contribution.transactionHash)) {
    fail(`Ungültiger Transaktionshash: ${contribution.id}`);
  }
}
if (project.status.acceptedContributions !== contributionData.contributions.length) {
  fail("Projektstatus und Beitragsregister melden verschiedene Beitragszahlen.");
}

const testSource = readFileSync(resolve("test/REISTToken.js"), "utf8");
const testCount = [...testSource.matchAll(/\bit\s*\(\s*["']/g)].length;
if (project.status.contractTestsPassing !== testCount) {
  fail(`Projektstatus meldet ${project.status.contractTestsPassing}, Testdatei enthält ${testCount} Tests.`);
}

const tokenSource = readFileSync(resolve("contracts/REISTToken.sol"), "utf8");
for (const invariant of [
  "1_000_000 ether",
  "700_000 ether",
  "200_000 ether",
  "100_000 ether",
  'ERC20("REIST Research Token", "REIST")',
]) {
  if (!tokenSource.includes(invariant)) fail(`Vertragsinvariante fehlt: ${invariant}`);
}

const siteApplication = readFileSync(resolve("site/app.js"), "utf8");
if (!siteApplication.includes("project?.status?.testnetDeployment")) {
  fail("Website darf das Deployment-Manifest vor einem Testnet-Deployment nicht anfragen.");
}

const siteRoot = resolve("site");
const generatedDocumentPaths = new Set(
  publicDocumentBuilds.map((document) => document.target.replaceAll("/", sep))
);
if (generatedDocumentPaths.size !== publicDocumentBuilds.length) {
  fail("Öffentliche HTML-Dokumentziele sind nicht eindeutig.");
}
const generatedSitePaths = new Set([
  ...generatedDocumentPaths,
  "LICENSE.txt",
  "robots.txt",
  "sitemap.xml",
]);
for (const document of publicDocumentBuilds) {
  if (!existsSync(resolve(document.source))) {
    fail(`Markdown-Quelle für öffentliche Dokumentseite fehlt: ${document.source}`);
  }
}
function validateSitePage(pageName, language, requiredStatements) {
  const pagePath = resolve(pageName);
  const pageDirectory = dirname(pagePath);
  const content = readFileSync(pagePath, "utf8");
  const label = relative(root, pagePath);

  if (!content.includes(`<html`) || !content.includes(`lang="${language}"`)) {
    fail(`${label} besitzt nicht die erwartete Sprache ${language}.`);
  }
  for (const statement of requiredStatements) {
    if (!content.toLowerCase().includes(statement.toLowerCase())) {
      fail(`${label}: Pflichthinweis fehlt: ${statement}`);
    }
  }
  if (
    !content.includes("data-language-switch") ||
    !content.includes("language.js") ||
    !content.includes('hreflang="de"') ||
    !content.includes('hreflang="en"')
  ) {
    fail(`${label}: Sprachumschaltung oder Alternativlinks fehlen.`);
  }
  const canonicalUrl = language === "de" ? publicSiteUrl() : publicSiteUrl("en/");
  if (!content.includes(`<link rel="canonical" href="${canonicalUrl}" />`)) {
    fail(`${label}: kanonische Live-URL fehlt.`);
  }
  for (const alternateUrl of [
    `${PUBLIC_SITE_ORIGIN}/`,
    `${PUBLIC_SITE_ORIGIN}/en/`,
  ]) {
    if (!content.includes(`href="${alternateUrl}"`)) {
      fail(`${label}: absolute Sprachalternative fehlt: ${alternateUrl}`);
    }
  }
  if (language === "de" && !content.includes('data-auto-language="true"')) {
    fail(`${label}: automatische Browser-Sprachauswahl fehlt.`);
  }

  const idMatches = [...content.matchAll(/\sid=["']([^"']+)["']/g)].map(
    (match) => match[1]
  );
  const ids = new Set(idMatches);
  if (ids.size !== idMatches.length) fail(`${label}: doppelte HTML-ID gefunden.`);
  if ([...content.matchAll(/<h1(?:\s|>)/g)].length !== 1) {
    fail(`${label}: genau eine H1 ist erforderlich.`);
  }

  const pageBountyIds = new Set(
    [...content.matchAll(/\sdata-bounty-id=["']([^"']+)["']/g)].map(
      (match) => match[1]
    )
  );
  for (const bountyId of bountyIds) {
    if (!pageBountyIds.has(bountyId)) {
      fail(`${label} enthält keinen Registereintrag für Bounty ${bountyId}.`);
    }
  }
  if (pageBountyIds.size !== bountyIds.size) {
    fail(`${label} und Bounty-Datei enthalten unterschiedlich viele Bounties.`);
  }

  for (const match of content.matchAll(/\s(?:href|src)=["']([^"']+)["']/g)) {
    const reference = match[1];
    if (/\.md(?:[?#]|$)/i.test(reference)) {
      fail(`${label} verlinkt eine rohe Markdown-Datei: ${reference}`);
    }
    if (reference.startsWith("#")) {
      if (!ids.has(reference.slice(1))) {
        fail(`${label} verweist auf fehlenden Anker: ${reference}`);
      }
      continue;
    }
    if (/^(?:https?:|mailto:|data:)/i.test(reference)) continue;

    const pathPart = reference.split(/[?#]/, 1)[0] || ".";
    const outputPath = resolve(pageDirectory, pathPart);
    const safeOutputPath =
      outputPath === siteRoot || outputPath.startsWith(`${siteRoot}${sep}`);
    if (!safeOutputPath) {
      fail(`${label} enthält einen unsicheren lokalen Pfad: ${reference}`);
    }
    const outputRelativePath = relative(siteRoot, outputPath);
    const projectPath = resolve(root, outputRelativePath);
    const safeProjectPath =
      projectPath === root || projectPath.startsWith(`${root}${sep}`);
    if (
      !existsSync(outputPath) &&
      !generatedSitePaths.has(outputRelativePath) &&
      (!safeProjectPath || !existsSync(projectPath))
    ) {
      fail(`${label} verweist auf fehlende lokale Datei: ${reference}`);
    }
  }

  if (/<script(?![^>]*\ssrc=)[^>]*>/i.test(content)) {
    fail(`${label} enthält ein Inline-Skript trotz strenger CSP.`);
  }
  if (/\sstyle=["']/i.test(content)) {
    fail(`${label} enthält Inline-Styles trotz strenger CSP.`);
  }
  return {
    dataAttributes: [...content.matchAll(/\s(data-[a-z0-9-]+)(?==|\s|>)/gi)]
      .map((match) => match[1].toLowerCase())
      .filter((attribute) => attribute !== "data-auto-language")
      .sort(),
    ids: [...ids].sort(),
  };
}

const germanRequiredSiteContent = [
  "kein Investment",
  "kein kryptografisches Primitiv",
  "funktioniert ohne Token",
  "öffentlich einsehbare REIST-FPGA-RTL",
  "explizite FPGA-Lizenzierung und unabhängige Hardware-Reproduktion",
  "Allowance-Roundtrip",
  "unmittelbar auf 0 widerrufen",
];
const englishRequiredSiteContent = [
  "no investment offering",
  "cryptographic primitive",
  "works without a token",
  "publicly accessible REIST FPGA RTL",
  "explicit FPGA licensing and independent hardware reproduction",
  "allowance roundtrip",
  "immediately cleared to zero",
];
if (project.status.testnetDeployment) {
  germanRequiredSiteContent.push("deployed", "Quellcode verifiziert");
  englishRequiredSiteContent.push("deployed", "source verified");
} else {
  germanRequiredSiteContent.push("nicht deployed", "noch nicht ausgerollten");
  englishRequiredSiteContent.push("not deployed", "not-yet-deployed");
}
const germanPage = validateSitePage(
  "site/index.html",
  "de",
  germanRequiredSiteContent
);
const englishPage = validateSitePage(
  "site/en/index.html",
  "en",
  englishRequiredSiteContent
);
const germanSiteSource = readFileSync(resolve("site/index.html"), "utf8");
const englishSiteSource = readFileSync(resolve("site/en/index.html"), "utf8");
for (const [source, label] of [
  [germanSiteSource, "Deutsche Website"],
  [englishSiteSource, "Englische Website"],
]) {
  if (
    !source.includes(`href="${FPGA_SOURCE_REPOSITORY}"`) ||
    !source.includes(`href="${FPGA_SOURCE_SNAPSHOT_URL}"`)
  ) {
    fail(`${label} verlinkt FPGA-Repository oder geprüften Quellstand nicht.`);
  }
}
if (JSON.stringify(germanPage.ids) !== JSON.stringify(englishPage.ids)) {
  fail("Deutsche und englische Website enthalten unterschiedliche HTML-IDs.");
}
if (
  JSON.stringify(germanPage.dataAttributes) !==
  JSON.stringify(englishPage.dataAttributes)
) {
  fail("Deutsche und englische Website enthalten unterschiedliche Funktionsattribute.");
}

const notFoundPage = readFileSync(resolve("site/404.html"), "utf8");
for (const required404Content of [
  'name="robots" content="noindex,follow"',
  'href="/"',
  'href="/en/"',
  'href="/styles.css"',
  "Seite nicht gefunden",
  "Page not found",
]) {
  if (!notFoundPage.includes(required404Content)) {
    fail(`404-Seite ist unvollständig: ${required404Content}`);
  }
}
if (/<script\b|\sstyle=["']/i.test(notFoundPage)) {
  fail("404-Seite enthält Inline-Code trotz strenger CSP.");
}

if (readdirSync(siteRoot).some((entry) => entry.toLowerCase().endsWith(".conf"))) {
  fail("Serverkonfiguration darf nicht im öffentlichen site-Verzeichnis liegen.");
}
const nginxConfigPath = resolve("deploy/nginx/reist-token.intracom.at.conf");
if (existsSync(nginxConfigPath)) {
  const nginxConfig = readFileSync(nginxConfigPath, "utf8");
  for (const requiredNginxDirective of [
    "server_name reisttoken.intracom.at;",
    "return 301 https://reist-token.intracom.at$request_uri;",
    "error_page 404 /404.html;",
    "try_files $uri $uri/ =404;",
    "default_type text/plain;",
    "application/xml xml;",
    "location ~ /\\.",
    "location ~ \\.sol$",
    "location ~* \\.md$",
    "Content-Security-Policy",
    "Strict-Transport-Security",
    "X-Frame-Options DENY",
    "Permissions-Policy",
    "X-Robots-Tag $reist_robots_tag",
    "/LICENSE.txt noindex;",
  ]) {
    if (!nginxConfig.includes(requiredNginxDirective)) {
      fail(`nginx-Konfiguration ist unvollständig: ${requiredNginxDirective}`);
    }
  }
  if (nginxConfig.includes("try_files $uri $uri/ /index.html")) {
    fail("nginx-Konfiguration enthält weiterhin einen Soft-404-Fallback.");
  }
  if (
    nginxConfig.indexOf("location ~ /\\.") >
    nginxConfig.indexOf("location ~ \\.sol$")
  ) {
    fail("nginx-Dotfile-Sperre muss vor den Endungs-Regexen ausgewertet werden.");
  }
}

const manifestPath = resolve("deployments/base-sepolia.json");
if (existsSync(manifestPath)) {
  const manifest = readJson(manifestPath);
  if (manifest.schemaVersion !== 2 || manifest.chainId !== 84532) {
    fail("Deployment-Manifest: falsches Schema oder falsche Chain-ID.");
  }
  if (!/^0x[a-fA-F0-9]{64}$/.test(manifest.blockHash || "")) {
    fail("Deployment-Manifest enthaelt keinen gueltigen Deployment-Blockhash.");
  }
  for (const address of Object.values(manifest.contracts)) {
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      fail("Deployment-Manifest enthält eine ungültige Vertragsadresse.");
    }
  }
  if (
    !manifest.runtimeCodeHashes?.token ||
    !manifest.runtimeCodeHashes?.founderVesting
  ) {
    fail("Deployment-Manifest enthält nicht beide Runtime-Codehashes.");
  }
  for (const hash of Object.values(manifest.runtimeCodeHashes)) {
    if (!/^0x[a-fA-F0-9]{64}$/.test(hash)) {
      fail("Deployment-Manifest enthält einen ungültigen Runtime-Codehash.");
    }
  }
  if (!project.status.testnetDeployment) {
    fail("Manifest existiert, aber Projektstatus meldet kein Testnet-Deployment.");
  }
  const roleDeployment = testnetRoles.deployment;
  if (
    testnetRoles.status !== deployedTestnetStatus ||
    roleDeployment?.manifest !== "deployments/base-sepolia.json" ||
    roleDeployment?.deployedAt !== manifest.deployedAt ||
    roleDeployment?.transactionHash !== manifest.transactionHash ||
    roleDeployment?.blockNumber !== manifest.blockNumber ||
    roleDeployment?.token !== manifest.contracts?.token ||
    roleDeployment?.founderVesting !== manifest.contracts?.founderVesting
  ) {
    fail("Testnet-Rollenregister widerspricht dem Deployment-Manifest.");
  }
  if (project.status.sourceVerified !== manifest.verification?.sourceVerified) {
    fail("Projekt- und Manifeststatus widersprechen sich bei der Source-Verifikation.");
  }
  const smokeOperation = readJson(
    "operations/base-sepolia-smoke-transfer.json"
  );
  const fundingOperation = smokeOperation.transactions?.funding;
  const tokenOperation = smokeOperation.transactions?.tokenTransfer;
  const hashPattern = /^0x[a-fA-F0-9]{64}$/;
  const decimalPattern = /^(?:0|[1-9]\d*)$/;
  if (
    smokeOperation.schemaVersion !== 1 ||
    smokeOperation.operationId !== "reist-base-sepolia-treasury-smoke-v1" ||
    smokeOperation.status !== "completed" ||
    smokeOperation.network !== "Base Sepolia" ||
    smokeOperation.chainId !== 84532 ||
    !isIsoInstant(smokeOperation.completedAt) ||
    !/^[a-fA-F0-9]{40}$/.test(smokeOperation.toolingCommit || "") ||
    smokeOperation.purpose !==
      "Technical treasury smoke test; not a bounty or contribution." ||
    smokeOperation.economicValue !== "none-promised-testnet-only" ||
    smokeOperation.sourceDeployment?.manifest !==
      "deployments/base-sepolia.json" ||
    smokeOperation.sourceDeployment?.transactionHash !==
      manifest.transactionHash ||
    smokeOperation.sourceDeployment?.token !== manifest.contracts?.token ||
    smokeOperation.sourceDeployment?.sourceVerified !== true ||
    smokeOperation.amounts?.fundingWei !== "5000000000000" ||
    smokeOperation.amounts?.tokenBaseUnits !== "1000000000000000000" ||
    smokeOperation.feeCapsWei?.funding !== "500000000000" ||
    smokeOperation.feeCapsWei?.token !== "1000000000000" ||
    smokeOperation.feeCapsWei?.total !== "1500000000000" ||
    !hashPattern.test(fundingOperation?.hash || "") ||
    !hashPattern.test(fundingOperation?.blockHash || "") ||
    fundingOperation?.from !== publicTestnetRoles.deployer ||
    fundingOperation?.to !== publicTestnetRoles.researchRewardsTreasury ||
    fundingOperation?.nonce !== 1 ||
    !Number.isSafeInteger(fundingOperation?.blockNumber) ||
    fundingOperation.blockNumber <= 0 ||
    !decimalPattern.test(fundingOperation?.feeWei || "") ||
    !hashPattern.test(tokenOperation?.hash || "") ||
    !hashPattern.test(tokenOperation?.blockHash || "") ||
    tokenOperation?.from !== publicTestnetRoles.researchRewardsTreasury ||
    tokenOperation?.to !== manifest.contracts?.token ||
    tokenOperation?.recipient !== publicTestnetRoles.ecosystemTreasury ||
    tokenOperation?.nonce !== 0 ||
    !Number.isSafeInteger(tokenOperation?.blockNumber) ||
    tokenOperation.blockNumber <= fundingOperation.blockNumber ||
    !decimalPattern.test(tokenOperation?.feeWei || "") ||
    fundingOperation.hash === tokenOperation.hash ||
    smokeOperation.validation?.confirmationsAfterEach !== 2 ||
    smokeOperation.validation?.canonicalReceipts !== true ||
    smokeOperation.validation?.exactBalanceDeltas !== true ||
    smokeOperation.validation?.baselineResearchReist !== "700000" ||
    smokeOperation.validation?.baselineEcosystemReist !== "200000" ||
    !decimalPattern.test(smokeOperation.finalBalances?.researchEthWei || "") ||
    smokeOperation.finalBalances?.researchTokenBaseUnits !==
      "699999000000000000000000" ||
    smokeOperation.finalBalances?.ecosystemTokenBaseUnits !==
      "200001000000000000000000"
  ) {
    fail("Öffentlicher Treasury-Operationsnachweis ist inkonsistent.");
  }
  const fundingFee = BigInt(fundingOperation.feeWei);
  const tokenFee = BigInt(tokenOperation.feeWei);
  if (
    fundingFee > BigInt(smokeOperation.feeCapsWei.funding) ||
    tokenFee > BigInt(smokeOperation.feeCapsWei.token) ||
    fundingFee + tokenFee > BigInt(smokeOperation.feeCapsWei.total) ||
    BigInt(smokeOperation.finalBalances.researchEthWei) !==
      BigInt(smokeOperation.amounts.fundingWei) - tokenFee
  ) {
    fail("Treasury-Operationsnachweis verletzt Gebühren- oder Bilanzgrenzen.");
  }
  if (!/^[a-fA-F0-9]{40}$/.test(manifest.source?.sourceCommit || "")) {
    fail("Deployment-Manifest ist nicht an einen Git-Commit gebunden.");
  }
  if (!/^[A-F0-9]{64}$/.test(manifest.source?.buildOutputSha256 || "")) {
    fail("Deployment-Manifest enthaelt keinen gebundenen Compiler-Output-Hash.");
  }
  if (!manifest.source?.repositoryRemote) {
    fail("Deployment-Manifest enthält keinen Repository-Remote.");
  }
  if (
    normalizePublicRepositoryUrl(manifest.source.repositoryRemote) !==
    manifest.source.repositoryRemote
  ) {
    fail("Deployment-Manifest enthält keine kanonische öffentliche Repository-URL.");
  }
  if (manifest.source.repositoryRemote !== PUBLIC_RELEASE_REPOSITORY) {
    fail("Deployment-Manifest verweist nicht auf das öffentliche Release-Repository.");
  }
  const deploymentRoot = resolve("deployments");
  const inputPath = resolve(
    deploymentRoot,
    manifest.source?.standardJsonInput || ""
  );
  if (!inputPath.startsWith(`${deploymentRoot}${sep}`)) {
    fail("Deployment-Manifest enthält einen unsicheren Bundle-Pfad.");
  }
  if (!existsSync(inputPath)) fail("Deployment-Verifikations-Bundle fehlt.");
  const standardInput = JSON.parse(readFileSync(inputPath, "utf8"));
  if (
    canonicalJsonSha256(standardInput) !==
    manifest.source.standardJsonInputSha256
  ) {
    fail("Deployment-Verifikations-Bundle stimmt nicht mit dem Manifest überein.");
  }
  const readme = readFileSync(resolve("README.md"), "utf8");
  const transparency = readFileSync(resolve("docs/TRANSPARENCY.md"), "utf8");
  if (
    /\|\s*base sepolia\s*\|[^\r\n|]*noch nicht deployed[^\r\n|]*\|/i.test(
      readme
    )
  ) {
    fail("README muss nach Deployment den Base-Sepolia-Status aktualisieren.");
  }
  if (/kein Testnet- oder Mainnet-Vertrag/i.test(transparency)) {
    fail("Transparenzdokument muss nach Deployment aktualisiert werden.");
  }
  const roleAddresses = [
    manifest.deployer,
    manifest.allocations?.founderVesting?.beneficiary,
    manifest.allocations?.researchRewards?.address,
    manifest.allocations?.ecosystemTreasury?.address,
  ].map((address) => String(address).toLowerCase());
  if (new Set(roleAddresses).size !== 4) {
    fail("Deployment- und Empfängerrollen sind nicht paarweise verschieden.");
  }
  const registeredRoleAddresses = [
    publicTestnetRoles.deployer,
    publicTestnetRoles.founderBeneficiary,
    publicTestnetRoles.researchRewardsTreasury,
    publicTestnetRoles.ecosystemTreasury,
  ].map((address) => String(address).toLowerCase());
  if (
    roleAddresses.some(
      (address, index) => address !== registeredRoleAddresses[index]
    )
  ) {
    fail("Deployment-Manifest widerspricht den registrierten Testnet-Rollen.");
  }
} else {
  if (project.status.testnetDeployment || project.status.sourceVerified) {
    fail("Projektstatus meldet ein Deployment oder eine Verifikation ohne Manifest.");
  }
  if (existsSync(resolve("deployments/base-sepolia-standard-input.json"))) {
    fail("Verifikations-Bundle existiert ohne Deployment-Manifest.");
  }
  if (
    testnetRoles.status !== fundedTestnetStatus ||
    Object.hasOwn(testnetRoles, "deployment")
  ) {
    fail("Testnet-Rollenregister meldet ohne Manifest einen falschen Zustand.");
  }
}

console.log(
  `Projektprüfung erfolgreich: ${requiredFiles.length} Pflichtdateien, ` +
    `${bountyData.bounties.length} Bounties, ` +
    `${contributionData.contributions.length} akzeptierte Beiträge.`
);
