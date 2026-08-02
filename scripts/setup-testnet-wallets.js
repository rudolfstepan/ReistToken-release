import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { Wallet } from "ethers";
import { CANONICAL_PAPER_DOI } from "./lib/project-identity.js";
import { readPasswordFromStandardInput } from "./lib/password-transport.js";

function fail(message) {
  throw new Error(message);
}

function privateFile(path, contents) {
  writeFileSync(path, contents, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
}

function assertRepositoryIgnore(path) {
  const result = spawnSync(
    "git",
    ["check-ignore", "-v", "--no-index", path],
    { encoding: "utf8", shell: false, windowsHide: true }
  );
  const repositoryRule = String(result.stdout || "")
    .split(/\r?\n/)
    .some((line) => line.startsWith(".gitignore:"));
  if (result.status !== 0 || !repositoryRule) {
    fail(`${path} muss ausdrücklich durch die Repository-.gitignore geschützt sein.`);
  }
}

function assertOutsideProject(path) {
  if (!isAbsolute(path)) {
    fail("Keystore-Verzeichnis muss ein absoluter Pfad sein.");
  }
  const projectRoot = resolve(".");
  const relation = relative(projectRoot, path);
  if (!relation || (!relation.startsWith("..") && !isAbsolute(relation))) {
    fail("Keystore-Verzeichnis muss außerhalb des Repositorys liegen.");
  }
}

if (!existsSync(resolve("package.json"))) {
  fail("Wallet-Setup muss aus dem Projektwurzelverzeichnis gestartet werden.");
}
if (process.env.REIST_CONFIRM_TESTNET_WALLET_SETUP !== "CREATE") {
  fail("Wallet-Setup verlangt die interaktive Bestätigung des PowerShell-Wrappers.");
}

let password = "";
try {
  password = readPasswordFromStandardInput();
} catch {
  fail("Keystore-Passwort konnte nicht über die geschützte Standardeingabe gelesen werden.");
}
delete process.env.REIST_CONFIRM_TESTNET_WALLET_SETUP;

const environmentPath = resolve(".env");
const environmentTemporaryPath = resolve(".env.reist-wallet-setup.tmp");
const configuredKeystoreDirectory = String(
  process.env.REIST_KEYSTORE_DIRECTORY || ""
).trim();
delete process.env.REIST_KEYSTORE_DIRECTORY;
if (!configuredKeystoreDirectory) {
  fail("PowerShell-Wrapper hat kein externes Keystore-Verzeichnis festgelegt.");
}
const targetDirectory = resolve(configuredKeystoreDirectory);
assertOutsideProject(targetDirectory);
const secretsRoot = dirname(targetDirectory);
if (existsSync(environmentPath)) {
  fail(".env existiert bereits; bestehende Geheimnisse werden niemals überschrieben.");
}
if (existsSync(environmentTemporaryPath)) {
  fail("Temporäre .env-Datei existiert bereits; zuerst manuell prüfen.");
}
if (existsSync(targetDirectory)) {
  fail("Testnet-Keystore-Verzeichnis existiert bereits und wird nicht überschrieben.");
}
assertRepositoryIgnore(".env");

const roles = [
  {
    id: "deployer",
    label: "Deployment wallet",
    environmentName: "DEPLOYER_ADDRESS",
  },
  {
    id: "founder-beneficiary",
    label: "Founder beneficiary",
    environmentName: "FOUNDER_BENEFICIARY",
  },
  {
    id: "research-treasury",
    label: "Research rewards treasury",
    environmentName: "RESEARCH_REWARDS_TREASURY",
  },
  {
    id: "ecosystem-treasury",
    label: "Ecosystem treasury",
    environmentName: "ECOSYSTEM_TREASURY",
  },
];

mkdirSync(secretsRoot, { recursive: true, mode: 0o700 });
const temporaryDirectory = mkdtempSync(
  join(secretsRoot, ".base-sepolia-wallets-")
);
let targetCreated = false;
let environmentCreated = false;
let committed = false;

try {
  const addresses = {};
  for (const [index, role] of roles.entries()) {
    console.log(`Verschlüssele Testnet-Keystore ${index + 1}/${roles.length} ...`);
    const wallet = Wallet.createRandom();
    const encryptedKeystore = await wallet.encrypt(password);
    privateFile(
      join(temporaryDirectory, `${role.id}.keystore.json`),
      `${encryptedKeystore}\n`
    );
    addresses[role.id] = wallet.address;
  }

  const uniqueAddresses = new Set(
    Object.values(addresses).map((address) => address.toLowerCase())
  );
  if (uniqueAddresses.size !== roles.length) {
    fail("Wallet-Generator lieferte unerwartet doppelte Adressen.");
  }

  privateFile(
    join(temporaryDirectory, "addresses.json"),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        network: "Base Sepolia",
        chainId: 84532,
        createdAt: new Date().toISOString(),
        custody: "centralized-testnet-pilot-four-independent-keypairs",
        addresses,
      },
      null,
      2
    )}\n`
  );
  privateFile(
    join(temporaryDirectory, "RECOVERY.txt"),
    [
      "REIST Base-Sepolia-Testnet-Wallets",
      "",
      "Die vier JSON-Keystores sind mit dem beim Setup eingegebenen Passwort verschlüsselt.",
      "Das Passwort wird nicht gespeichert und kann nicht wiederhergestellt werden.",
      "Vor Faucet oder Deployment dieses Verzeichnis und das Passwort getrennt sichern.",
      "Diese Wallets niemals für Mainnet, reale Werte oder andere Projekte verwenden.",
      "Die .env-Datei enthält nur die öffentliche Deployer-Adresse, keinen privaten Schlüssel.",
      "",
    ].join("\n")
  );

  privateFile(
    environmentTemporaryPath,
    [
      "# Automatisch erzeugte, ausschließlich lokale Base-Sepolia-Testkonfiguration.",
      "# Enthält Adressen und lokale Dienstkonfiguration, aber keinen privaten Wallet-Schlüssel.",
      `TESTNET_DEPLOYER_ADDRESS=${addresses.deployer}`,
      "",
      `REIST_KEYSTORE_DIRECTORY=${targetDirectory}`,
      "",
      "BASE_SEPOLIA_RPC_URL=https://sepolia.base.org",
      "",
      `FOUNDER_BENEFICIARY=${addresses["founder-beneficiary"]}`,
      `RESEARCH_REWARDS_TREASURY=${addresses["research-treasury"]}`,
      `ECOSYSTEM_TREASURY=${addresses["ecosystem-treasury"]}`,
      "",
      "# Vor npm run verify:testnet lokal ergänzen.",
      "ETHERSCAN_API_KEY=",
      "",
      `REIST_PAPER_DOI=${CANONICAL_PAPER_DOI}`,
      "",
    ].join("\n")
  );

  renameSync(temporaryDirectory, targetDirectory);
  targetCreated = true;
  renameSync(environmentTemporaryPath, environmentPath);
  environmentCreated = true;
  committed = true;
  try {
    chmodSync(targetDirectory, 0o700);
    chmodSync(environmentPath, 0o600);
  } catch {
    // Windows kann POSIX-Modi ignorieren; Git-Ignore und Keystore-Verschlüsselung bleiben aktiv.
  }

  console.log("Vier unabhängige Testnet-Keypairs wurden lokal erzeugt.");
  for (const role of roles) {
    console.log(`${role.environmentName}: ${addresses[role.id]}`);
  }
  console.log("Keystores: %LOCALAPPDATA%\\REIST\\base-sepolia-wallets (verschlüsselt)");
  console.log("Konfiguration: .env (lokal, git-ignoriert)");
  console.log("Vor Verwendung Backup und npm run check:testnet-recovery durchführen.");
} catch (error) {
  if (!committed && environmentCreated && existsSync(environmentPath)) {
    rmSync(environmentPath, { force: true });
  }
  if (!committed && targetCreated && existsSync(targetDirectory)) {
    rmSync(targetDirectory, { force: true, recursive: true });
  }
  throw error;
} finally {
  password = "";
  if (existsSync(environmentTemporaryPath)) {
    rmSync(environmentTemporaryPath, { force: true });
  }
  if (existsSync(temporaryDirectory)) {
    rmSync(temporaryDirectory, { force: true, recursive: true });
  }
}
