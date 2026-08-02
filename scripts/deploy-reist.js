import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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

function requiredEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} fehlt. Siehe .env.example.`);
  }
  return value;
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
  const result = spawnSync("git", arguments_, {
    encoding: "utf8",
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

const [deployer] = await ethers.getSigners();
if (!deployer) {
  throw new Error("Kein Testnet-Deployment-Signer konfiguriert.");
}

const deployerAddress = await deployer.getAddress();
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

const token = await ethers.deployContract(
  "REISTToken",
  [founderBeneficiary, researchRewardsTreasury, ecosystemTreasury],
  deployer
);
await token.waitForDeployment();

const tokenAddress = await token.getAddress();
const founderVestingAddress = await token.founderVesting();
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

const deploymentTransaction = token.deploymentTransaction();
if (!deploymentTransaction) {
  throw new Error("Deployment-Transaktion konnte nicht ermittelt werden.");
}
const receipt = await deploymentTransaction.wait();
const block = await ethers.provider.getBlock(receipt.blockNumber);
if (!block || receipt.status !== 1) {
  throw new Error("Deployment-Receipt oder Blockdaten sind ungültig.");
}
const [tokenCode, vestingCode] = await Promise.all([
  ethers.provider.getCode(tokenAddress),
  ethers.provider.getCode(founderVestingAddress),
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
      start: Number(await vesting.start()),
      cliff: Number(await vesting.cliff()),
      end: Number(await vesting.end()),
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

mkdirSync(resolve("deployments"), { recursive: true });
writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, {
  encoding: "utf8",
  flag: "w",
});
writeFileSync(
  VERIFICATION_INPUT_PATH,
  `${JSON.stringify(build.input, null, 2)}\n`,
  { encoding: "utf8", flag: "w" }
);

const projectData = JSON.parse(readFileSync(PROJECT_DATA_PATH, "utf8"));
projectData.lastUpdated = new Date().toISOString().slice(0, 10);
projectData.token.status = "base-sepolia-pilot-deployed-no-economic-value";
projectData.status.testnetDeployment = true;
projectData.status.sourceVerified = false;
writeFileSync(PROJECT_DATA_PATH, `${JSON.stringify(projectData, null, 2)}\n`, "utf8");

console.log(`Token: ${tokenAddress}`);
console.log(`Founder vesting: ${founderVestingAddress}`);
console.log(`Manifest: ${MANIFEST_PATH}`);
console.log(`Verifikations-Bundle: ${VERIFICATION_INPUT_PATH}`);
console.log("Deployment und Invariantenprüfung erfolgreich.");
