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
import { pathToFileURL } from "node:url";
import { parse as parseEnvironment } from "dotenv";
import {
  Contract,
  FetchRequest,
  Interface,
  JsonRpcProvider,
  ZeroAddress,
  concat,
  getAddress,
  getCreateAddress,
  keccak256,
  parseUnits,
} from "ethers";
import {
  assertNoAmbiguousBuildInfo,
  canonicalJsonSha256,
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

const EXPECTED_CHAIN_ID = 84532n;
const EXPECTED_TRANSACTION_HASH =
  "0x4d8f54cd5cf2950ab1b2032c8f042ac16b3cc20fb65fca5221c0933df38f021c";
const EXPECTED_DEPLOYMENT_NONCE = 0;
const DEPLOYED_SOURCE_COMMIT =
  "e3a732afcc0a6ced913621edcef49f81046979bf";
const DEPLOYED_SOURCE_TAG = "v0.1.0-predeployment.2";
const FUNDED_TESTNET_STATUS =
  "wallets-created-recovery-checked-funded-not-deployed";
const DEPLOYED_TESTNET_STATUS =
  "base-sepolia-pilot-deployed-no-economic-value";
const MANIFEST_PATH = resolve("deployments", "base-sepolia.json");
const VERIFICATION_INPUT_PATH = resolve(
  "deployments",
  "base-sepolia-standard-input.json"
);
const PROJECT_DATA_PATH = resolve("data", "project.json");
const TESTNET_ROLES_PATH = resolve("data", "testnet-roles.json");
const TOKEN_ARTIFACT_PATH = resolve(
  "artifacts",
  "contracts",
  "REISTToken.sol",
  "REISTToken.json"
);
const VESTING_ARTIFACT_PATH = resolve(
  "artifacts",
  "contracts",
  "REISTFounderVesting.sol",
  "REISTFounderVesting.json"
);
const RPC_ATTEMPTS = 8;
const RPC_INITIAL_DELAY_MS = 500;
const RPC_MAX_DELAY_MS = 4_000;

function fail(message) {
  throw new Error(message);
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) fail(message);
}

function normalizeHex(value) {
  return String(value || "").toLowerCase();
}

function checkedAddress(value, label) {
  let address;
  try {
    address = getAddress(String(value || ""));
  } catch {
    fail(`${label} ist keine gueltige Ethereum-Adresse.`);
  }
  if (address === ZeroAddress) fail(`${label} darf nicht die Nulladresse sein.`);
  return address;
}

function readJson(path, label) {
  if (!existsSync(path)) fail(`${label} fehlt.`);
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    fail(`${label} ist kein gueltiges JSON.`);
  }
}

function writeJsonAtomically(path, value) {
  if (existsSync(path)) {
    const existing = readJson(path, path);
    if (canonicalJsonSha256(existing) === canonicalJsonSha256(value)) {
      return;
    }
  }
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
      // Der urspruengliche Fehler bleibt fuer die Recovery massgeblich.
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
      `.reist-finalize-probe-${process.pid}-${randomUUID()}`
    );
    try {
      writeFileSync(probePath, "", { encoding: "utf8", flag: "wx" });
    } finally {
      if (existsSync(probePath)) unlinkSync(probePath);
    }
  }
}

function assertExistingOutputCompatible(path, expected, label) {
  if (!existsSync(path)) return;
  const existing = readJson(path, label);
  if (canonicalJsonSha256(existing) !== canonicalJsonSha256(expected)) {
    fail(`${label} existiert bereits mit abweichendem Inhalt.`);
  }
}

function sleep(milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

async function retryRpc(label, operation, accept = (value) => value != null) {
  let lastError;
  let delay = RPC_INITIAL_DELAY_MS;
  for (let attempt = 1; attempt <= RPC_ATTEMPTS; attempt += 1) {
    try {
      const result = await operation();
      if (accept(result)) return result;
      lastError = new Error(`${label} wurde leer beantwortet.`);
    } catch (error) {
      lastError = error;
    }
    if (attempt < RPC_ATTEMPTS) {
      await sleep(delay);
      delay = Math.min(delay * 2, RPC_MAX_DELAY_MS);
    }
  }
  throw new Error(`${label} ist nach ${RPC_ATTEMPTS} Versuchen nicht abrufbar.`, {
    cause: lastError,
  });
}

function gitEnvironment() {
  const environment = { ...process.env };
  for (const name of [
    "ETHERSCAN_API_KEY",
    "REIST_WALLET_PASSWORD",
    "TESTNET_DEPLOYER_PRIVATE_KEY",
  ]) {
    delete environment[name];
  }
  environment.GCM_INTERACTIVE = "Never";
  environment.GIT_TERMINAL_PROMPT = "0";
  return environment;
}

function gitOutput(arguments_, description, trim = true, timeout = 10_000) {
  const result = spawnSync("git", arguments_, {
    encoding: "utf8",
    env: gitEnvironment(),
    shell: false,
    timeout,
    windowsHide: true,
  });
  if (result.status !== 0) {
    const reason = result.error?.message || result.stderr || result.stdout;
    fail(`${description} fehlgeschlagen: ${String(reason).trim()}`);
  }
  return trim ? result.stdout.trim() : result.stdout;
}

function repositoryPathForSourceKey(sourceKey) {
  const path = String(sourceKey || "").replace(/^project\//, "");
  const segments = path.split("/");
  if (
    !path.startsWith("contracts/") ||
    !path.endsWith(".sol") ||
    segments.some(
      (segment) =>
        !segment ||
        segment === "." ||
        segment === ".." ||
        !/^[A-Za-z0-9_.-]+$/.test(segment)
    )
  ) {
    fail(`Unerwarteter lokaler Source-Key: ${sourceKey}`);
  }
  return path;
}

function assertDeployedSourceProvenance(build) {
  const remote = normalizePublicRepositoryUrl(
    gitOutput(["config", "--get", "remote.origin.url"], "Git-Remote-Ermittlung")
  );
  assertEqual(
    remote,
    PUBLIC_RELEASE_REPOSITORY,
    "Recovery muss aus dem kanonischen oeffentlichen Release-Repository laufen."
  );

  const localTagType = gitOutput(
    ["cat-file", "-t", DEPLOYED_SOURCE_TAG],
    "Lokale Release-Tag-Pruefung"
  );
  assertEqual(
    localTagType,
    "tag",
    `${DEPLOYED_SOURCE_TAG} muss ein annotiertes Release-Tag sein.`
  );
  const localTaggedCommit = gitOutput(
    ["rev-parse", `${DEPLOYED_SOURCE_TAG}^{commit}`],
    "Lokale Release-Commit-Pruefung"
  ).toLowerCase();
  assertEqual(
    localTaggedCommit,
    DEPLOYED_SOURCE_COMMIT,
    `${DEPLOYED_SOURCE_TAG} verweist nicht auf den Deployment-Commit.`
  );

  assertPublicCommitPublished(remote, DEPLOYED_SOURCE_COMMIT);
  const remoteTagOutput = gitOutput(
    [
      "ls-remote",
      "--tags",
      remote,
      `refs/tags/${DEPLOYED_SOURCE_TAG}`,
      `refs/tags/${DEPLOYED_SOURCE_TAG}^{}`,
    ],
    "Oeffentliche Release-Tag-Pruefung",
    true,
    30_000
  );
  const remoteTagReferences = new Map(
    remoteTagOutput
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        const [hash, reference] = line.trim().split(/\s+/, 2);
        return [reference, String(hash || "").toLowerCase()];
      })
  );
  assertEqual(
    remoteTagReferences.get(`refs/tags/${DEPLOYED_SOURCE_TAG}^{}`),
    DEPLOYED_SOURCE_COMMIT,
    "Das oeffentliche annotierte Release-Tag verweist nicht auf den Deployment-Commit."
  );

  for (const sourceKey of Object.keys(build.input.sources).filter((key) =>
    key.startsWith("project/")
  )) {
    const repositoryPath = repositoryPathForSourceKey(sourceKey);
    const committedSource = gitOutput(
      ["show", `${DEPLOYED_SOURCE_COMMIT}:${repositoryPath}`],
      `Git-Quellpruefung fuer ${repositoryPath}`,
      false
    );
    assertEqual(
      committedSource,
      build.input.sources[sourceKey].content,
      `${repositoryPath} stimmt nicht mit dem Deployment-Commit ueberein.`
    );
  }

  return remote;
}

export function assertDeploymentTransaction(transaction, expected) {
  if (!transaction) fail("Deployment-Transaktion fehlt.");
  assertEqual(
    normalizeHex(transaction.hash),
    normalizeHex(expected.transactionHash),
    "RPC lieferte eine andere Transaktion."
  );
  assertEqual(
    BigInt(transaction.chainId),
    BigInt(expected.chainId),
    "Deployment-Transaktion gehoert nicht zu Base Sepolia."
  );
  assertEqual(
    checkedAddress(transaction.from, "Transaktionsabsender"),
    checkedAddress(expected.deployer, "Erwarteter Deployer"),
    "Deployment-Transaktion stammt nicht von der registrierten Deployer-Adresse."
  );
  if (transaction.to != null) {
    fail("Deployment-Transaktion ist keine Vertragserstellung (to muss null sein)." );
  }
  assertEqual(
    Number(transaction.nonce),
    Number(expected.nonce),
    "Deployment-Transaktion verwendet nicht den erwarteten Nonce 0."
  );
  assertEqual(BigInt(transaction.value), 0n, "Deployment-Transaktion uebertraegt ETH.");
  assertEqual(
    normalizeHex(transaction.data),
    normalizeHex(expected.initCode),
    "Deployment-Initcode oder Konstruktorargumente weichen vom freigegebenen Build ab."
  );
}

export function assertDeploymentReceipt(receipt, expected) {
  if (!receipt) fail("Deployment-Receipt fehlt.");
  assertEqual(receipt.status, 1, "Deployment-Receipt meldet keinen Erfolg.");
  assertEqual(
    normalizeHex(receipt.hash),
    normalizeHex(expected.transactionHash),
    "Deployment-Receipt gehoert nicht zur erwarteten Transaktion."
  );
  assertEqual(
    checkedAddress(receipt.from, "Receipt-Absender"),
    checkedAddress(expected.deployer, "Erwarteter Deployer"),
    "Deployment-Receipt stammt nicht von der registrierten Deployer-Adresse."
  );
  if (receipt.to != null) fail("Deployment-Receipt ist keine Vertragserstellung.");
  assertEqual(
    checkedAddress(receipt.contractAddress, "Token-Vertragsadresse"),
    checkedAddress(expected.tokenAddress, "Erwartete Token-Vertragsadresse"),
    "Receipt-Vertragsadresse entspricht nicht der vorhergesagten Token-Adresse."
  );
}

export function assertRuntimeMatchesArtifact(actualCode, artifact, label) {
  const actual = normalizeHex(actualCode).replace(/^0x/, "");
  const compiled = normalizeHex(artifact?.deployedBytecode).replace(/^0x/, "");
  if (!actual || !compiled || actual.length % 2 !== 0 || compiled.length % 2 !== 0) {
    fail(`${label}: Runtime-Bytecode ist ungueltig.`);
  }
  assertEqual(
    actual.length,
    compiled.length,
    `${label}: Runtime-Bytecode hat nicht die kompilierte Laenge.`
  );

  const ignoredBytes = new Set();
  for (const references of Object.values(artifact.immutableReferences || {})) {
    for (const reference of references) {
      const start = Number(reference.start);
      const length = Number(reference.length);
      if (
        !Number.isSafeInteger(start) ||
        !Number.isSafeInteger(length) ||
        start < 0 ||
        length <= 0 ||
        start + length > actual.length / 2
      ) {
        fail(`${label}: Artefakt enthaelt ungueltige Immutable-Referenzen.`);
      }
      for (let offset = start; offset < start + length; offset += 1) {
        ignoredBytes.add(offset);
      }
    }
  }

  for (let offset = 0; offset < actual.length / 2; offset += 1) {
    if (ignoredBytes.has(offset)) continue;
    const index = offset * 2;
    if (actual.slice(index, index + 2) !== compiled.slice(index, index + 2)) {
      fail(`${label}: Runtime-Bytecode weicht ausserhalb der Immutables ab.`);
    }
  }
}

function assertMintEvents(receipt, tokenArtifact, tokenAddress, allocations) {
  const tokenInterface = new Interface(tokenArtifact.abi);
  const transferEvent = tokenInterface.getEvent("Transfer");
  const transfers = receipt.logs
    .filter(
      (log) =>
        checkedAddress(log.address, "Log-Adresse") === tokenAddress &&
        normalizeHex(log.topics?.[0]) === normalizeHex(transferEvent.topicHash)
    )
    .map((log) => tokenInterface.parseLog(log));
  assertEqual(transfers.length, 3, "Deployment muss genau drei Token-Mint-Events enthalten.");

  const observed = new Map();
  for (const transfer of transfers) {
    assertEqual(
      getAddress(transfer.args.from),
      ZeroAddress,
      "Deployment-Transfer stammt nicht von der Nulladresse."
    );
    observed.set(
      checkedAddress(transfer.args.to, "Mint-Empfaenger"),
      BigInt(transfer.args.value)
    );
  }
  assertEqual(observed.size, 3, "Deployment-Mints verwenden nicht drei Empfaenger.");
  for (const [address, amount] of allocations) {
    assertEqual(observed.get(address), amount, `Falscher Deployment-Mint fuer ${address}.`);
  }
}

async function main() {
  if (process.argv.length !== 2) {
    fail("Dieser Finalizer akzeptiert keine Transaktions- oder Netzwerkparameter.");
  }

  const environmentPath = resolve(".env");
  if (!existsSync(environmentPath)) fail("Lokale .env-Konfiguration fehlt.");
  let parsedEnvironment;
  try {
    parsedEnvironment = parseEnvironment(readFileSync(environmentPath, "utf8"));
  } catch {
    fail("Lokale .env-Konfiguration ist nicht lesbar.");
  }
  if (Object.hasOwn(parsedEnvironment, "TESTNET_DEPLOYER_PRIVATE_KEY")) {
    fail(".env darf keinen dauerhaft gespeicherten Deployer-Private-Key enthalten.");
  }
  const rpcUrl = String(parsedEnvironment.BASE_SEPOLIA_RPC_URL || "").trim();
  let parsedRpcUrl;
  try {
    parsedRpcUrl = new URL(rpcUrl);
  } catch {
    fail("BASE_SEPOLIA_RPC_URL ist keine gueltige URL.");
  }
  if (
    parsedRpcUrl.protocol !== "https:" ||
    parsedRpcUrl.username ||
    parsedRpcUrl.password
  ) {
    fail("BASE_SEPOLIA_RPC_URL muss HTTPS ohne eingebettete Zugangsdaten verwenden.");
  }

  const testnetRoles = readJson(
    TESTNET_ROLES_PATH,
    "Oeffentliches Testnet-Rollenregister"
  );
  const projectData = readJson(PROJECT_DATA_PATH, "Projektstatus-Datei");
  if (
    testnetRoles.network !== "Base Sepolia" ||
    testnetRoles.chainId !== Number(EXPECTED_CHAIN_ID) ||
    !new Set([FUNDED_TESTNET_STATUS, DEPLOYED_TESTNET_STATUS]).has(
      testnetRoles.status
    )
  ) {
    fail("Oeffentliches Testnet-Rollenregister passt nicht zum Base-Sepolia-Piloten.");
  }
  if (
    projectData.framework?.publicPaper?.doi !== CANONICAL_PAPER_DOI ||
    projectData.token?.networkPilot?.chainId !== Number(EXPECTED_CHAIN_ID)
  ) {
    fail("Projektstatus widerspricht DOI oder Base-Sepolia-Netzwerk.");
  }

  const roles = {
    deployer: checkedAddress(testnetRoles.roles?.deployer, "Deployer"),
    founder: checkedAddress(
      testnetRoles.roles?.founderBeneficiary,
      "Founder-Beneficiary"
    ),
    research: checkedAddress(
      testnetRoles.roles?.researchRewardsTreasury,
      "Research-Treasury"
    ),
    ecosystem: checkedAddress(
      testnetRoles.roles?.ecosystemTreasury,
      "Ecosystem-Treasury"
    ),
  };
  if (
    new Set(Object.values(roles).map((address) => address.toLowerCase())).size !== 4
  ) {
    fail("Deployment- und Empfaengeradressen muessen paarweise verschieden sein.");
  }

  assertNoAmbiguousBuildInfo();
  const build = loadCurrentReistBuild();
  const publicRepository = assertDeployedSourceProvenance(build);
  const tokenArtifact = readJson(TOKEN_ARTIFACT_PATH, "REISTToken-Artefakt");
  const vestingArtifact = readJson(
    VESTING_ARTIFACT_PATH,
    "REISTFounderVesting-Artefakt"
  );
  if (!/^0x[0-9a-f]+$/i.test(tokenArtifact.bytecode || "")) {
    fail("REISTToken-Artefakt enthaelt keinen Deployment-Bytecode.");
  }
  const tokenInterface = new Interface(tokenArtifact.abi);
  const constructorArguments = tokenInterface.encodeDeploy([
    roles.founder,
    roles.research,
    roles.ecosystem,
  ]);
  const expectedInitCode = concat([
    tokenArtifact.bytecode,
    constructorArguments,
  ]);
  const predictedTokenAddress = getCreateAddress({
    from: roles.deployer,
    nonce: EXPECTED_DEPLOYMENT_NONCE,
  });
  const predictedVestingAddress = getCreateAddress({
    from: predictedTokenAddress,
    nonce: 1,
  });
  if (testnetRoles.status === DEPLOYED_TESTNET_STATUS) {
    const registeredDeployment = testnetRoles.deployment;
    if (
      normalizeHex(registeredDeployment?.transactionHash) !==
        normalizeHex(EXPECTED_TRANSACTION_HASH) ||
      checkedAddress(registeredDeployment?.token, "Registrierter Token") !==
        predictedTokenAddress ||
      checkedAddress(
        registeredDeployment?.founderVesting,
        "Registriertes Founder-Vesting"
      ) !== predictedVestingAddress
    ) {
      fail("Bereits registrierte Deployment-Daten widersprechen der Recovery.");
    }
  }
  if (projectData.status?.sourceVerified === true) {
    fail("Recovery darf einen bereits verifizierten Projektstatus nicht zuruecksetzen.");
  }

  const rpcRequest = new FetchRequest(rpcUrl);
  rpcRequest.timeout = 10_000;
  const provider = new JsonRpcProvider(rpcRequest, EXPECTED_CHAIN_ID, {
    staticNetwork: true,
  });

  try {
    const rpcChainId = await retryRpc("RPC-Chain-ID", () =>
      provider.send("eth_chainId", [])
    );
    assertEqual(
      BigInt(rpcChainId),
      EXPECTED_CHAIN_ID,
      `RPC meldet Chain-ID ${BigInt(rpcChainId)} statt ${EXPECTED_CHAIN_ID}.`
    );

    const transaction = await retryRpc("Deployment-Transaktion", () =>
      provider.getTransaction(EXPECTED_TRANSACTION_HASH)
    );
    assertDeploymentTransaction(transaction, {
      transactionHash: EXPECTED_TRANSACTION_HASH,
      chainId: EXPECTED_CHAIN_ID,
      deployer: roles.deployer,
      nonce: EXPECTED_DEPLOYMENT_NONCE,
      initCode: expectedInitCode,
    });

    const receipt = await retryRpc("Deployment-Receipt", () =>
      provider.getTransactionReceipt(EXPECTED_TRANSACTION_HASH)
    );
    assertDeploymentReceipt(receipt, {
      transactionHash: EXPECTED_TRANSACTION_HASH,
      deployer: roles.deployer,
      tokenAddress: predictedTokenAddress,
    });
    assertEqual(
      transaction.blockNumber,
      receipt.blockNumber,
      "Transaktion und Receipt widersprechen sich beim Block."
    );
    assertEqual(
      normalizeHex(transaction.blockHash),
      normalizeHex(receipt.blockHash),
      "Transaktion und Receipt widersprechen sich beim Blockhash."
    );
    if (!transaction.blockHash || !receipt.blockHash) {
      fail("Bestaetigte Transaktion oder Receipt enthalten keinen Blockhash.");
    }

    const block = await retryRpc("Deployment-Block", async () => {
      try {
        const byNumber = await provider.getBlock(receipt.blockNumber);
        if (byNumber) return byNumber;
      } catch {
        // Ein zweiter, exakt gebundener Lookup kann einen RPC-Backend-Lag umgehen.
      }
      return provider.getBlock(receipt.blockHash);
    });
    assertEqual(block.number, receipt.blockNumber, "Deployment-Blocknummer weicht ab.");
    assertEqual(
      normalizeHex(block.hash),
      normalizeHex(receipt.blockHash),
      "Deployment-Blockhash weicht ab."
    );
    if (
      !block.transactions.some(
        (hash) => normalizeHex(hash) === normalizeHex(EXPECTED_TRANSACTION_HASH)
      )
    ) {
      fail("Deployment-Transaktion fehlt im bestaetigten Deployment-Block.");
    }

    await retryRpc(
      "Deployment-Bestaetigungen",
      () => provider.getBlockNumber(),
      (height) => Number(height) >= receipt.blockNumber + 2
    );
    const canonicalReceipt = await retryRpc("Kanonischer Deployment-Receipt", () =>
      provider.getTransactionReceipt(EXPECTED_TRANSACTION_HASH)
    );
    assertDeploymentReceipt(canonicalReceipt, {
      transactionHash: EXPECTED_TRANSACTION_HASH,
      deployer: roles.deployer,
      tokenAddress: predictedTokenAddress,
    });
    assertEqual(
      canonicalReceipt.blockNumber,
      receipt.blockNumber,
      "Deployment-Receipt wurde nach den Bestaetigungen umgeordnet."
    );
    assertEqual(
      normalizeHex(canonicalReceipt.blockHash),
      normalizeHex(receipt.blockHash),
      "Deployment-Receipt verweist nach den Bestaetigungen auf einen anderen Block."
    );
    const canonicalBlock = await retryRpc("Kanonischer Deployment-Block", () =>
      provider.getBlock(receipt.blockNumber)
    );
    assertEqual(
      normalizeHex(canonicalBlock.hash),
      normalizeHex(receipt.blockHash),
      "Kanonische Blocknummer verweist nicht auf den bestaetigten Deployment-Block."
    );
    if (
      !canonicalBlock.transactions.some(
        (hash) => normalizeHex(hash) === normalizeHex(EXPECTED_TRANSACTION_HASH)
      )
    ) {
      fail("Deployment-Transaktion fehlt nach den Bestaetigungen im kanonischen Block.");
    }

    const blockTag = receipt.blockNumber;
    const [tokenCode, vestingCode] = await retryRpc(
      "Deployment-Runtime-Bytecode",
      () =>
        Promise.all([
          provider.getCode(predictedTokenAddress, blockTag),
          provider.getCode(predictedVestingAddress, blockTag),
        ]),
      (codes) => codes.every((code) => code && code !== "0x")
    );
    assertRuntimeMatchesArtifact(tokenCode, tokenArtifact, "REISTToken");
    assertRuntimeMatchesArtifact(
      vestingCode,
      vestingArtifact,
      "REISTFounderVesting"
    );

    const token = new Contract(predictedTokenAddress, tokenArtifact.abi, provider);
    const vesting = new Contract(
      predictedVestingAddress,
      vestingArtifact.abi,
      provider
    );
    const atDeployment = { blockTag };
    const state = await retryRpc("Deployment-Invarianten", () =>
      Promise.all([
        token.name(atDeployment),
        token.symbol(atDeployment),
        token.decimals(atDeployment),
        token.totalSupply(atDeployment),
        token.MAX_SUPPLY(atDeployment),
        token.RESEARCH_REWARDS_ALLOCATION(atDeployment),
        token.ECOSYSTEM_TREASURY_ALLOCATION(atDeployment),
        token.FOUNDER_ALLOCATION(atDeployment),
        token.balanceOf(roles.research, atDeployment),
        token.balanceOf(roles.ecosystem, atDeployment),
        token.balanceOf(predictedVestingAddress, atDeployment),
        token.balanceOf(roles.deployer, atDeployment),
        token.balanceOf(roles.founder, atDeployment),
        token.balanceOf(predictedTokenAddress, atDeployment),
        token.founderVesting(atDeployment),
        token.researchRewardsTreasury(atDeployment),
        token.ecosystemTreasury(atDeployment),
        vesting.owner(atDeployment),
        vesting.start(atDeployment),
        vesting.duration(atDeployment),
        vesting.CLIFF_DURATION(atDeployment),
        vesting.VESTING_DURATION(atDeployment),
        vesting.cliff(atDeployment),
        vesting.end(atDeployment),
        vesting["released(address)"](predictedTokenAddress, atDeployment),
        vesting["vestedAmount(address,uint64)"](
          predictedTokenAddress,
          BigInt(block.timestamp),
          atDeployment
        ),
      ])
    );

    const expectedSupply = parseUnits("1000000", 18);
    const expectedResearch = parseUnits("700000", 18);
    const expectedEcosystem = parseUnits("200000", 18);
    const expectedFounder = parseUnits("100000", 18);
    const oneYear = 365n * 24n * 60n * 60n;
    const threeYears = 3n * oneYear;
    const expectedStart = BigInt(block.timestamp);
    const expectedCliff = expectedStart + oneYear;
    const expectedEnd = expectedStart + threeYears;
    const expectedState = [
      "REIST Research Token",
      "REIST",
      18n,
      expectedSupply,
      expectedSupply,
      expectedResearch,
      expectedEcosystem,
      expectedFounder,
      expectedResearch,
      expectedEcosystem,
      expectedFounder,
      0n,
      0n,
      0n,
      predictedVestingAddress,
      roles.research,
      roles.ecosystem,
      roles.founder,
      expectedStart,
      threeYears,
      oneYear,
      threeYears,
      expectedCliff,
      expectedEnd,
      0n,
      0n,
    ];
    for (let index = 0; index < expectedState.length; index += 1) {
      const actual =
        typeof state[index] === "string" && /^0x[0-9a-f]{40}$/i.test(state[index])
          ? getAddress(state[index])
          : state[index];
      assertEqual(actual, expectedState[index], `On-chain-Invariante ${index + 1} weicht ab.`);
    }

    assertMintEvents(receipt, tokenArtifact, predictedTokenAddress, [
      [roles.research, expectedResearch],
      [roles.ecosystem, expectedEcosystem],
      [predictedVestingAddress, expectedFounder],
    ]);

    const forbiddenFunctions = new Set([
      "mint",
      "pause",
      "unpause",
      "blacklist",
      "setTax",
      "owner",
      "upgradeToAndCall",
    ]);
    for (const entry of tokenArtifact.abi) {
      if (entry.type === "function" && forbiddenFunctions.has(entry.name)) {
        fail(`Token-Artefakt enthaelt unerwartete privilegierte Funktion: ${entry.name}.`);
      }
    }

    const committedPackage = JSON.parse(
      gitOutput(
        ["show", `${DEPLOYED_SOURCE_COMMIT}:package.json`],
        "Deployment-package.json-Pruefung",
        false
      )
    );
    const deployedAt = new Date(Number(block.timestamp) * 1000).toISOString();
    const manifest = {
      schemaVersion: 2,
      status: "testnet-pilot-no-economic-value",
      network: "Base Sepolia",
      chainId: Number(EXPECTED_CHAIN_ID),
      deployedAt,
      deployer: roles.deployer,
      transactionHash: EXPECTED_TRANSACTION_HASH,
      blockNumber: receipt.blockNumber,
      blockHash: receipt.blockHash,
      contracts: {
        token: predictedTokenAddress,
        founderVesting: predictedVestingAddress,
      },
      runtimeCodeHashes: {
        token: keccak256(tokenCode),
        founderVesting: keccak256(vestingCode),
      },
      token: {
        name: "REIST Research Token",
        symbol: "REIST",
        decimals: 18,
        totalSupply: "1000000",
        deployedCodeHash: keccak256(tokenCode),
      },
      allocations: {
        researchRewards: {
          amount: "700000",
          address: roles.research,
        },
        ecosystemTreasury: {
          amount: "200000",
          address: roles.ecosystem,
        },
        founderVesting: {
          amount: "100000",
          beneficiary: roles.founder,
          vestingContract: predictedVestingAddress,
          start: Number(expectedStart),
          cliff: Number(expectedCliff),
          end: Number(expectedEnd),
        },
      },
      source: {
        sourceCommit: DEPLOYED_SOURCE_COMMIT,
        sourceTag: DEPLOYED_SOURCE_TAG,
        repositoryRemote: publicRepository,
        buildInfoId: build.buildInfoId,
        standardJsonInput: "base-sepolia-standard-input.json",
        standardJsonInputSha256: build.inputSha256,
        buildOutputSha256: build.outputSha256,
        sourceKeys: build.sourceKeys,
        contractNames: build.contractNames,
        solidity: build.compilerLongVersion,
        openZeppelin: committedPackage.dependencies["@openzeppelin/contracts"],
        hardhat: committedPackage.devDependencies.hardhat,
        ethers: committedPackage.devDependencies.ethers,
        paperDoi: CANONICAL_PAPER_DOI,
      },
      verification: {
        sourceVerified: false,
        externalAudit: false,
      },
    };

    const updatedProject = structuredClone(projectData);
    updatedProject.lastUpdated = deployedAt.slice(0, 10);
    updatedProject.token.status = DEPLOYED_TESTNET_STATUS;
    updatedProject.status.testnetDeployment = true;
    updatedProject.status.sourceVerified = false;

    const updatedRoles = structuredClone(testnetRoles);
    updatedRoles.status = DEPLOYED_TESTNET_STATUS;
    updatedRoles.deployment = {
      manifest: "deployments/base-sepolia.json",
      deployedAt: manifest.deployedAt,
      transactionHash: manifest.transactionHash,
      blockNumber: manifest.blockNumber,
      token: manifest.contracts.token,
      founderVesting: manifest.contracts.founderVesting,
    };
    updatedRoles.notice =
      "The REIST Research Token pilot is deployed on Base Sepolia only. It has no promised economic value and is not a mainnet asset.";

    assertExistingOutputCompatible(
      MANIFEST_PATH,
      manifest,
      "Base-Sepolia-Deployment-Manifest"
    );
    assertExistingOutputCompatible(
      VERIFICATION_INPUT_PATH,
      build.input,
      "Solidity-Standard-JSON-Bundle"
    );
    assertOutputDirectoriesWritable();
    writeJsonAtomically(VERIFICATION_INPUT_PATH, build.input);
    writeJsonAtomically(MANIFEST_PATH, manifest);
    writeJsonAtomically(PROJECT_DATA_PATH, updatedProject);
    writeJsonAtomically(TESTNET_ROLES_PATH, updatedRoles);

    assertExistingOutputCompatible(
      MANIFEST_PATH,
      manifest,
      "Base-Sepolia-Deployment-Manifest"
    );
    assertExistingOutputCompatible(
      VERIFICATION_INPUT_PATH,
      build.input,
      "Solidity-Standard-JSON-Bundle"
    );
    assertEqual(
      canonicalJsonSha256(readJson(PROJECT_DATA_PATH, "Projektstatus-Datei")),
      canonicalJsonSha256(updatedProject),
      "Projektstatus wurde nicht exakt finalisiert."
    );
    assertEqual(
      canonicalJsonSha256(
        readJson(TESTNET_ROLES_PATH, "Oeffentliches Testnet-Rollenregister")
      ),
      canonicalJsonSha256(updatedRoles),
      "Rollenregister wurde nicht exakt finalisiert."
    );

    console.log("Base-Sepolia-Deployment lokal erfolgreich finalisiert.");
    console.log(`Transaktion: ${EXPECTED_TRANSACTION_HASH}`);
    console.log(`Token: ${predictedTokenAddress}`);
    console.log(`Founder vesting: ${predictedVestingAddress}`);
    console.log("Es wurde keine Transaktion signiert oder gesendet.");
  } finally {
    await provider.destroy();
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  await main();
}
