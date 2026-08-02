import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { network } from "hardhat";
import {
  assertNoAmbiguousBuildInfo,
  loadCurrentReistBuild,
} from "./lib/build-provenance.js";
import {
  assertPublicCommitPublished,
  normalizePublicRepositoryUrl,
} from "./lib/repository-provenance.js";
import {
  CANONICAL_PAPER_DOI,
  PUBLIC_RELEASE_REPOSITORY,
} from "./lib/project-identity.js";

const EXPECTED_NETWORK = "baseSepolia";
const EXPECTED_CHAIN_ID = 84532n;
const MANIFEST_PATH = resolve("deployments", "base-sepolia.json");
const VERIFICATION_INPUT_PATH = resolve(
  "deployments",
  "base-sepolia-standard-input.json"
);
const PROJECT_DATA_PATH = resolve("data", "project.json");
const TESTNET_ROLES_PATH = resolve("data", "testnet-roles.json");
const FUNDED_TESTNET_STATUS =
  "wallets-created-recovery-checked-funded-not-deployed";

function requiredEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} fehlt. Siehe .env.example.`);
  }
  return value;
}

function writeJsonAtomically(path, value) {
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
    });
    renameSync(temporaryPath, path);
  } catch (error) {
    try {
      if (existsSync(temporaryPath)) unlinkSync(temporaryPath);
    } catch {
      // Der ursprüngliche Schreibfehler ist für die Recovery maßgeblich.
    }
    throw error;
  }
}

function assertOutputDirectoriesWritable() {
  const directories = [resolve("deployments"), resolve("data")];
  mkdirSync(directories[0], { recursive: true });
  for (const directory of directories) {
    const probePath = resolve(
      directory,
      `.reist-write-probe-${process.pid}-${randomUUID()}`
    );
    try {
      writeFileSync(probePath, "", { encoding: "utf8", flag: "wx" });
    } finally {
      if (existsSync(probePath)) unlinkSync(probePath);
    }
  }
}

function validatedAddress(ethers, name) {
  const raw = requiredEnvironment(name);
  let address;

  try {
    address = ethers.getAddress(raw);
  } catch {
    throw new Error(`${name} ist keine gültige Ethereum-Adresse.`);
  }

  if (address === ethers.ZeroAddress) {
    throw new Error(`${name} darf nicht die Nulladresse sein.`);
  }

  return address;
}

function assertDistinct(addresses) {
  const normalized = addresses.map((address) => address.toLowerCase());
  if (new Set(normalized).size !== normalized.length) {
    throw new Error(
      "Deployment-, Founder- und Treasury-Adressen müssen paarweise verschieden sein."
    );
  }
}

function gitOutput(arguments_, description) {
  const gitEnvironment = { ...process.env };
  for (const name of [
    "ETHERSCAN_API_KEY",
    "REIST_WALLET_PASSWORD",
    "TESTNET_DEPLOYER_PRIVATE_KEY",
  ]) {
    delete gitEnvironment[name];
  }
  const result = spawnSync("git", arguments_, {
    encoding: "utf8",
    env: gitEnvironment,
    shell: false,
  });
  if (result.status !== 0) {
    throw new Error(
      `${description} fehlgeschlagen: ${(result.stderr || result.stdout).trim()}`
    );
  }
  return result.stdout.trim();
}

function sourceProvenance() {
  const commit = gitOutput(
    ["rev-parse", "--verify", "HEAD"],
    "Git-Commit-Ermittlung"
  );
  if (!/^[a-f0-9]{40}$/i.test(commit)) {
    throw new Error("Deployment verlangt einen vollständigen Git-Commit.");
  }

  const dirty = gitOutput(
    ["status", "--porcelain", "--untracked-files=normal"],
    "Git-Statusprüfung"
  );
  if (dirty) {
    throw new Error("Deployment ist nur aus einem vollständig committed Worktree erlaubt.");
  }

  const remote = gitOutput(
    ["config", "--get", "remote.origin.url"],
    "Git-Remote-Ermittlung"
  );
  const publicRepositoryUrl = normalizePublicRepositoryUrl(remote);
  if (publicRepositoryUrl !== PUBLIC_RELEASE_REPOSITORY) {
    throw new Error(
      `Deployment ist ausschließlich aus ${PUBLIC_RELEASE_REPOSITORY} freigegeben.`
    );
  }
  assertPublicCommitPublished(publicRepositoryUrl, commit);
  return { commit, remote: publicRepositoryUrl };
}

assertNoAmbiguousBuildInfo();
const build = loadCurrentReistBuild();
const provenance = sourceProvenance();
const projectPackage = JSON.parse(readFileSync(resolve("package.json"), "utf8"));

const { ethers, networkName } = await network.create();

if (networkName !== EXPECTED_NETWORK) {
  throw new Error(
    `Dieses Skript ist für ${EXPECTED_NETWORK} gesperrt; ausgewählt wurde ${networkName}.`
  );
}

const providerNetwork = await ethers.provider.getNetwork();
if (providerNetwork.chainId !== EXPECTED_CHAIN_ID) {
  throw new Error(
    `Falsche Chain-ID ${providerNetwork.chainId}; erwartet wird ${EXPECTED_CHAIN_ID}.`
  );
}

if (
  (existsSync(MANIFEST_PATH) || existsSync(VERIFICATION_INPUT_PATH)) &&
  process.env.ALLOW_MANIFEST_OVERWRITE !== "YES"
) {
  throw new Error(
    "Ein Base-Sepolia-Manifest existiert bereits. Für einen bewussten Ersatz " +
      "ALLOW_MANIFEST_OVERWRITE=YES setzen."
  );
}
assertOutputDirectoriesWritable();

const founderBeneficiary = validatedAddress(ethers, "FOUNDER_BENEFICIARY");
const researchRewardsTreasury = validatedAddress(
  ethers,
  "RESEARCH_REWARDS_TREASURY"
);
const ecosystemTreasury = validatedAddress(ethers, "ECOSYSTEM_TREASURY");
const paperDoi = requiredEnvironment("REIST_PAPER_DOI");
if (paperDoi !== CANONICAL_PAPER_DOI) {
  throw new Error(
    `REIST_PAPER_DOI muss der freigegebenen kanonischen Version ${CANONICAL_PAPER_DOI} entsprechen.`
  );
}

const testnetRoles = JSON.parse(readFileSync(TESTNET_ROLES_PATH, "utf8"));
const projectData = JSON.parse(readFileSync(PROJECT_DATA_PATH, "utf8"));
if (
  testnetRoles.network !== "Base Sepolia" ||
  testnetRoles.chainId !== Number(EXPECTED_CHAIN_ID) ||
  testnetRoles.status !== FUNDED_TESTNET_STATUS
) {
  throw new Error(
    "Öffentliches Testnet-Rollenregister ist nicht finanziert und deploymentbereit."
  );
}
for (const [roleName, configuredAddress] of [
  ["founderBeneficiary", founderBeneficiary],
  ["researchRewardsTreasury", researchRewardsTreasury],
  ["ecosystemTreasury", ecosystemTreasury],
]) {
  if (ethers.getAddress(testnetRoles.roles?.[roleName]) !== configuredAddress) {
    throw new Error(`Rollenregister widerspricht der Konfiguration: ${roleName}.`);
  }
}

const [deployer] = await ethers.getSigners();
if (!deployer) {
  throw new Error("Kein Testnet-Deployment-Signer konfiguriert.");
}

const deployerAddress = await deployer.getAddress();
if (ethers.getAddress(testnetRoles.roles?.deployer) !== deployerAddress) {
  throw new Error("Rollenregister widerspricht der Deployment-Adresse.");
}
assertDistinct([
  deployerAddress,
  founderBeneficiary,
  researchRewardsTreasury,
  ecosystemTreasury,
]);
const balance = await ethers.provider.getBalance(deployerAddress);
if (balance === 0n) {
  throw new Error("Die Deployment-Wallet besitzt kein Base-Sepolia-Test-ETH.");
}

console.log("REIST Research Token — Base-Sepolia-Pilot (ohne wirtschaftlichen Wert)");
console.log(`Deployer: ${deployerAddress}`);
console.log(`Research treasury: ${researchRewardsTreasury}`);
console.log(`Ecosystem treasury: ${ecosystemTreasury}`);
console.log(`Founder beneficiary: ${founderBeneficiary}`);

let deploymentTransaction;
let receipt;
let tokenAddress;
let founderVestingAddress;
let deploymentConfirmed = false;

try {
  const token = await ethers.deployContract(
    "REISTToken",
    [founderBeneficiary, researchRewardsTreasury, ecosystemTreasury],
    deployer
  );
  deploymentTransaction = token.deploymentTransaction();
  if (!deploymentTransaction) {
    throw new Error("Deployment-Transaktion konnte nicht ermittelt werden.");
  }
  tokenAddress = await token.getAddress();
  console.log(`Deployment-Transaktion gesendet: ${deploymentTransaction.hash}`);

  receipt = await deploymentTransaction.wait();
  if (!receipt || receipt.status !== 1) {
    throw new Error("Deployment-Transaktion wurde nicht erfolgreich bestätigt.");
  }
  deploymentConfirmed = true;

  const block = await ethers.provider.getBlock(receipt.blockNumber);
  if (!block) throw new Error("Deployment-Block ist nicht abrufbar.");

  founderVestingAddress = await token.founderVesting();
  const vesting = await ethers.getContractAt(
    "REISTFounderVesting",
    founderVestingAddress
  );
  const expectedSupply = ethers.parseUnits("1000000", 18);
  const expectedResearch = ethers.parseUnits("700000", 18);
  const expectedEcosystem = ethers.parseUnits("200000", 18);
  const expectedFounder = ethers.parseUnits("100000", 18);
  const checks = await Promise.all([
    token.totalSupply(),
    token.balanceOf(researchRewardsTreasury),
    token.balanceOf(ecosystemTreasury),
    token.balanceOf(founderVestingAddress),
    token.balanceOf(deployerAddress),
    vesting.owner(),
  ]);
  if (
    checks[0] !== expectedSupply ||
    checks[1] !== expectedResearch ||
    checks[2] !== expectedEcosystem ||
    checks[3] !== expectedFounder ||
    checks[4] !== 0n ||
    checks[5].toLowerCase() !== founderBeneficiary.toLowerCase()
  ) {
    throw new Error("Post-Deployment-Invarianten sind fehlgeschlagen.");
  }

  const [tokenCode, vestingCode, vestingStart, vestingCliff, vestingEnd] =
    await Promise.all([
      ethers.provider.getCode(tokenAddress),
      ethers.provider.getCode(founderVestingAddress),
      vesting.start(),
      vesting.cliff(),
      vesting.end(),
    ]);
  if (tokenCode === "0x" || vestingCode === "0x") {
    throw new Error("Runtime-Bytecode eines Deployment-Vertrags fehlt.");
  }

  const manifest = {
    schemaVersion: 2,
    status: "testnet-pilot-no-economic-value",
    network: "Base Sepolia",
    chainId: Number(EXPECTED_CHAIN_ID),
    deployedAt: new Date(Number(block.timestamp) * 1000).toISOString(),
    deployer: deployerAddress,
    transactionHash: receipt.hash,
    blockNumber: receipt.blockNumber,
    contracts: {
      token: tokenAddress,
      founderVesting: founderVestingAddress,
    },
    runtimeCodeHashes: {
      token: ethers.keccak256(tokenCode),
      founderVesting: ethers.keccak256(vestingCode),
    },
    token: {
      name: "REIST Research Token",
      symbol: "REIST",
      decimals: 18,
      totalSupply: "1000000",
      deployedCodeHash: ethers.keccak256(tokenCode),
    },
    allocations: {
      researchRewards: {
        amount: "700000",
        address: researchRewardsTreasury,
      },
      ecosystemTreasury: {
        amount: "200000",
        address: ecosystemTreasury,
      },
      founderVesting: {
        amount: "100000",
        beneficiary: founderBeneficiary,
        vestingContract: founderVestingAddress,
        start: Number(vestingStart),
        cliff: Number(vestingCliff),
        end: Number(vestingEnd),
      },
    },
    source: {
      sourceCommit: provenance.commit,
      repositoryRemote: provenance.remote,
      buildInfoId: build.buildInfoId,
      standardJsonInput: "base-sepolia-standard-input.json",
      standardJsonInputSha256: build.inputSha256,
      sourceKeys: build.sourceKeys,
      contractNames: build.contractNames,
      solidity: build.compilerLongVersion,
      openZeppelin: projectPackage.dependencies["@openzeppelin/contracts"],
      hardhat: projectPackage.devDependencies.hardhat,
      ethers: projectPackage.devDependencies.ethers,
      paperDoi,
    },
    verification: {
      sourceVerified: false,
      externalAudit: false,
    },
  };

  writeJsonAtomically(MANIFEST_PATH, manifest);
  writeJsonAtomically(VERIFICATION_INPUT_PATH, build.input);

  projectData.lastUpdated = new Date().toISOString().slice(0, 10);
  projectData.token.status = "base-sepolia-pilot-deployed-no-economic-value";
  projectData.status.testnetDeployment = true;
  projectData.status.sourceVerified = false;
  writeJsonAtomically(PROJECT_DATA_PATH, projectData);

  testnetRoles.status = "base-sepolia-pilot-deployed-no-economic-value";
  testnetRoles.deployment = {
    manifest: "deployments/base-sepolia.json",
    deployedAt: manifest.deployedAt,
    transactionHash: manifest.transactionHash,
    blockNumber: manifest.blockNumber,
    token: manifest.contracts.token,
    founderVesting: manifest.contracts.founderVesting,
  };
  testnetRoles.notice =
    "The REIST Research Token pilot is deployed on Base Sepolia only. It has no promised economic value and is not a mainnet asset.";
  writeJsonAtomically(TESTNET_ROLES_PATH, testnetRoles);

  console.log(`Token: ${tokenAddress}`);
  console.log(`Founder vesting: ${founderVestingAddress}`);
  console.log(`Manifest: ${MANIFEST_PATH}`);
  console.log(`Verifikations-Bundle: ${VERIFICATION_INPUT_PATH}`);
  console.log("Deployment und Invariantenprüfung erfolgreich.");
} catch (error) {
  const observedReceipt = receipt || error?.receipt;
  const transactionHash =
    observedReceipt?.hash || deploymentTransaction?.hash || "nicht verfügbar";
  const replacementReceiptConfirmsDeployment =
    observedReceipt?.status === 1 &&
    typeof observedReceipt.contractAddress === "string" &&
    typeof tokenAddress === "string" &&
    observedReceipt.contractAddress.toLowerCase() === tokenAddress.toLowerCase();
  const confirmedExpectedDeployment =
    deploymentConfirmed || replacementReceiptConfirmsDeployment;
  if (confirmedExpectedDeployment) {
    console.error("WICHTIG: Das On-chain-Deployment war erfolgreich.");
  } else {
    console.error(
      "WICHTIG: Ein Deployment-Versuch wurde gestartet; sein On-chain-Ergebnis ist nicht sicher finalisiert."
    );
  }
  console.error(`Transaktion: ${transactionHash}`);
  if (tokenAddress) console.error(`Token: ${tokenAddress}`);
  if (founderVestingAddress) {
    console.error(`Founder vesting: ${founderVestingAddress}`);
  }
  console.error(
    "Nicht erneut deployen; zuerst Transaktion und Adressen per Explorer oder RPC prüfen."
  );
  throw new Error(
    confirmedExpectedDeployment
      ? "On-chain erfolgreich, lokale Finalisierung oder Validierung fehlgeschlagen."
      : "Deployment-Ergebnis unklar; vor jedem weiteren Versuch On-chain prüfen.",
    { cause: error }
  );
}
