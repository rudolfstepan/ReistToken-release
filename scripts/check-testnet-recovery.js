import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { getAddress, Wallet, ZeroAddress } from "ethers";
import { readPasswordFromStandardInput } from "./lib/password-transport.js";

function fail(message) {
  throw new Error(message);
}

function parseJsonFile(path, description) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    fail(`${description} ist nicht als gültiges JSON lesbar.`);
  }
}

function externalDirectory(value) {
  if (!isAbsolute(value)) {
    fail("Recovery-Verzeichnis muss ein absoluter Pfad sein.");
  }
  const directory = resolve(value);
  const relation = relative(resolve("."), directory);
  if (!relation || (!relation.startsWith("..") && !isAbsolute(relation))) {
    fail("Recovery-Verzeichnis muss außerhalb des Repositorys liegen.");
  }
  return directory;
}

if (process.env.REIST_CONFIRM_TESTNET_RECOVERY !== "CHECK") {
  fail("Recovery-Prüfung verlangt den interaktiven PowerShell-Wrapper.");
}
delete process.env.REIST_CONFIRM_TESTNET_RECOVERY;
const recoveryDirectory = externalDirectory(
  String(process.env.REIST_RECOVERY_WALLET_DIRECTORY || "").trim()
);
delete process.env.REIST_RECOVERY_WALLET_DIRECTORY;

const publicRoles = parseJsonFile(
  resolve("data/testnet-roles.json"),
  "Öffentliches Testnet-Rollenregister"
);
if (
  publicRoles.schemaVersion !== 1 ||
  publicRoles.network !== "Base Sepolia" ||
  publicRoles.chainId !== 84532
) {
  fail("Öffentliches Testnet-Rollenregister besitzt falsches Schema oder Netzwerk.");
}
const roleInputs = {
  deployer: publicRoles.roles?.deployer,
  "founder-beneficiary": publicRoles.roles?.founderBeneficiary,
  "research-treasury": publicRoles.roles?.researchRewardsTreasury,
  "ecosystem-treasury": publicRoles.roles?.ecosystemTreasury,
};
const expectedAddresses = {};
for (const [id, value] of Object.entries(roleInputs)) {
  try {
    expectedAddresses[id] = getAddress(value || ZeroAddress);
  } catch {
    fail(`Öffentliches Testnet-Rollenregister enthält keine gültige Adresse für ${id}.`);
  }
  if (expectedAddresses[id] === ZeroAddress) {
    fail(`Öffentliche Testnet-Rolle darf nicht die Nulladresse sein: ${id}.`);
  }
}
if (
  new Set(
    Object.values(expectedAddresses).map((address) => address.toLowerCase())
  ).size !== Object.keys(expectedAddresses).length
) {
  fail("Öffentliche Testnet-Rollenadressen müssen paarweise verschieden sein.");
}

const addressDocument = parseJsonFile(
  join(recoveryDirectory, "addresses.json"),
  "Keystore-Adressdokument"
);
if (
  addressDocument.schemaVersion !== 1 ||
  addressDocument.network !== "Base Sepolia" ||
  addressDocument.chainId !== 84532
) {
  fail("Keystore-Adressdokument besitzt falsches Schema oder Netzwerk.");
}

const encryptedKeystores = new Map();
for (const [id, expectedAddress] of Object.entries(expectedAddresses)) {
  let documentedAddress;
  try {
    documentedAddress = getAddress(
      addressDocument.addresses?.[id] || ZeroAddress
    );
  } catch {
    fail(`Keystore-Adressdokument enthält keine gültige Adresse für ${id}.`);
  }
  if (documentedAddress !== expectedAddress) {
    fail(`Keystore-Adressdokument widerspricht dem öffentlichen Rollenregister: ${id}.`);
  }

  const keystorePath = join(recoveryDirectory, `${id}.keystore.json`);
  if (!existsSync(keystorePath)) {
    fail(`Verschlüsselter Keystore fehlt: ${id}.`);
  }
  const encryptedKeystore = readFileSync(keystorePath, "utf8");
  const keystore = parseJsonFile(keystorePath, `Verschlüsselter Keystore ${id}`);
  let keystoreAddress;
  try {
    keystoreAddress = getAddress(
      `0x${String(keystore.address || "").replace(/^0x/i, "")}`
    );
  } catch {
    fail(`Verschlüsselter Keystore enthält keine gültige Adresse: ${id}.`);
  }
  if (
    keystore.version !== 3 ||
    !(keystore.crypto || keystore.Crypto) ||
    keystoreAddress !== expectedAddress
  ) {
    fail(`Verschlüsselter Keystore ist strukturell ungültig: ${id}.`);
  }
  encryptedKeystores.set(id, encryptedKeystore);
}

let password = "";
try {
  password = readPasswordFromStandardInput();
  for (const [id, encryptedKeystore] of encryptedKeystores) {
    let recoveredWallet;
    try {
      recoveredWallet = await Wallet.fromEncryptedJson(
        encryptedKeystore,
        password
      );
    } catch {
      fail(`Recovery-Prüfung ist für ${id} fehlgeschlagen.`);
    }
    if (getAddress(recoveredWallet.address) !== expectedAddresses[id]) {
      fail(`Recovery-Prüfung lieferte eine falsche Adresse für ${id}.`);
    }
    recoveredWallet = null;
  }
} finally {
  password = "";
}

console.log("Alle vier Keystores wurden erfolgreich entschlüsselt und dem öffentlichen Rollenregister zugeordnet.");
