import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { isAbsolute, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parse as parseEnvironment } from "dotenv";
import {
  Contract,
  FetchRequest,
  Interface,
  JsonRpcProvider,
  ZeroAddress,
  getAddress,
  keccak256,
} from "ethers";
import {
  BASE_SEPOLIA_CHAIN_ID,
  readJson,
  writeJsonAtomically,
} from "./lib/base-sepolia-smoke-plan.js";
import {
  CLIFF_DURATION_SECONDS,
  FIXED_VESTING,
  FOUNDER_ALLOCATION,
  TOTAL_SUPPLY,
  VESTING_CLIFF,
  VESTING_DURATION_SECONDS,
  VESTING_END,
  VESTING_EVIDENCE_PATH,
  VESTING_START,
  createVestingEvidence,
  validateVestingEvidence,
  validateVestingPublicConfiguration,
} from "./lib/base-sepolia-vesting-evidence.js";
import { PUBLIC_RELEASE_REPOSITORY } from "./lib/project-identity.js";
import { assertPublicCommitPublished } from "./lib/repository-provenance.js";

const DEPLOYMENT_PATH = resolve("deployments", "base-sepolia.json");
const ROLES_PATH = resolve("data", "testnet-roles.json");
const PROJECT_PATH = resolve("data", "project.json");
const OUTPUT_PATH = resolve(VESTING_EVIDENCE_PATH);
const LOG_BLOCK_SPAN = 2_000;
const FORBIDDEN_SECRET_ENVIRONMENT_NAMES = [
  "TESTNET_DEPLOYER_PRIVATE_KEY",
  "RESEARCH_TREASURY_PRIVATE_KEY",
  "REIST_WALLET_PASSWORD",
  "MNEMONIC",
  "SEED_PHRASE",
  "ETHERSCAN_API_KEY",
  "BASE_SEPOLIA_RPC_URL",
];
const TOKEN_ABI = [
  "function FOUNDER_ALLOCATION() view returns (uint256)",
  "function founderVesting() view returns (address)",
  "function balanceOf(address) view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "event Transfer(address indexed from,address indexed to,uint256 value)",
];
const VESTING_ABI = [
  "function owner() view returns (address)",
  "function start() view returns (uint256)",
  "function cliff() view returns (uint256)",
  "function end() view returns (uint256)",
  "function duration() view returns (uint256)",
  "function CLIFF_DURATION() view returns (uint64)",
  "function VESTING_DURATION() view returns (uint64)",
  "function released(address) view returns (uint256)",
  "function releasable(address) view returns (uint256)",
  "function vestedAmount(address,uint64) view returns (uint256)",
  "event ERC20Released(address indexed token,uint256 amount)",
  "event OwnershipTransferred(address indexed previousOwner,address indexed newOwner)",
];

class VestingObservationError extends Error {}

function fail(message) {
  throw new VestingObservationError(message);
}

function sameHex(actual, expected) {
  return String(actual || "").toLowerCase() === String(expected || "").toLowerCase();
}

function sanitizedChildEnvironment() {
  const childEnvironment = { ...process.env };
  for (const name of [
    ...FORBIDDEN_SECRET_ENVIRONMENT_NAMES,
    "REIST_VESTING_ENV_FILE",
    "NODE_OPTIONS",
    "NODE_PATH",
  ]) {
    delete childEnvironment[name];
  }
  return childEnvironment;
}

function gitOutput(args) {
  const result = spawnSync("git", args, {
    cwd: resolve("."),
    encoding: "utf8",
    env: sanitizedChildEnvironment(),
    shell: false,
    windowsHide: true,
  });
  if (result.status !== 0) fail("Lokale Git-Provenienz konnte nicht geprüft werden.");
  return result.stdout.trim();
}

function toolingCommit() {
  const commit = gitOutput(["rev-parse", "HEAD"]).toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(commit)) fail("Git-HEAD ist ungültig.");
  if (gitOutput(["status", "--porcelain", "--untracked-files=no"])) {
    fail("Getrackte Dateien sind nicht sauber; Vesting-Observer zuerst committen.");
  }
  assertPublicCommitPublished(PUBLIC_RELEASE_REPOSITORY, commit);
  return commit;
}

function configuredRpcUrl() {
  const configuredPath = String(process.env.REIST_VESTING_ENV_FILE || "").trim();
  delete process.env.REIST_VESTING_ENV_FILE;
  if (!configuredPath || !isAbsolute(configuredPath)) {
    fail("REIST_VESTING_ENV_FILE muss auf eine absolute externe .env-Datei zeigen.");
  }
  const environmentPath = resolve(configuredPath);
  const relation = relative(resolve("."), environmentPath);
  if (!relation || (!relation.startsWith("..") && !isAbsolute(relation))) {
    fail("Vesting-RPC-Konfiguration muss außerhalb des Repositorys liegen.");
  }
  if (!existsSync(environmentPath)) fail("Lokale externe .env-Konfiguration fehlt.");
  const source = readFileSync(environmentPath, "utf8");
  const assignmentNames = source
    .split(/\r?\n/)
    .map((line) =>
      line.match(/^\s*(?:export\s+)?([A-Z_][A-Z0-9_]*)\s*=/i)?.[1]
    )
    .filter(Boolean);
  for (const name of assignmentNames) {
    if (/(?:PRIVATE.*KEY|PASSWORD|PASSPHRASE|MNEMONIC|SEED)/i.test(name)) {
      fail("Die Vesting-RPC-Datei darf keine Signatur- oder walletbezogenen Geheimnisse enthalten.");
    }
  }
  const rpcEntries = source
    .split(/\r?\n/)
    .filter((line) => /^\s*(?:export\s+)?BASE_SEPOLIA_RPC_URL\s*=/.test(line));
  if (rpcEntries.length !== 1) {
    fail("BASE_SEPOLIA_RPC_URL muss in der externen .env exakt einmal vorkommen.");
  }
  const parsed = parseEnvironment(
    rpcEntries[0].replace(/^\s*export\s+/, "")
  );
  let rpcUrl;
  try {
    rpcUrl = new URL(String(parsed.BASE_SEPOLIA_RPC_URL || ""));
  } catch {
    fail("BASE_SEPOLIA_RPC_URL ist ungültig.");
  }
  if (rpcUrl.protocol !== "https:" || rpcUrl.username || rpcUrl.password) {
    fail("Base-Sepolia-RPC muss HTTPS ohne eingebettete Zugangsdaten verwenden.");
  }
  return rpcUrl;
}

function sumValues(events) {
  return events.reduce((total, event) => total + BigInt(event.args.value), 0n);
}

async function getLogsInChunks(provider, filter, fromBlock, toBlock) {
  const logs = [];
  for (let start = fromBlock; start <= toBlock; start += LOG_BLOCK_SPAN) {
    const end = Math.min(start + LOG_BLOCK_SPAN - 1, toBlock);
    logs.push(
      ...(await provider.getLogs({
        ...filter,
        fromBlock: start,
        toBlock: end,
      }))
    );
  }
  return logs.sort(
    (left, right) =>
      left.blockNumber - right.blockNumber ||
      left.transactionIndex - right.transactionIndex ||
      left.index - right.index
  );
}

async function main() {
  if (process.argv.length !== 2) fail("Vesting-Observer akzeptiert keine Parameter.");
  const configuredEnvironmentFile = process.env.REIST_VESTING_ENV_FILE;
  for (const name of [
    ...FORBIDDEN_SECRET_ENVIRONMENT_NAMES,
    "NODE_OPTIONS",
    "NODE_PATH",
  ]) {
    delete process.env[name];
  }
  if (configuredEnvironmentFile !== undefined) {
    process.env.REIST_VESTING_ENV_FILE = configuredEnvironmentFile;
  }
  if (existsSync(OUTPUT_PATH)) {
    fail("Vesting-Read-only-Nachweis existiert bereits; keine Wiederholung.");
  }

  const deployment = readJson(DEPLOYMENT_PATH, "Deployment-Manifest");
  const roles = readJson(ROLES_PATH, "Rollenregister");
  const project = readJson(PROJECT_PATH, "Projektstatus");
  const publicConfig = validateVestingPublicConfiguration(
    deployment,
    roles,
    project,
    false
  );
  const rpcUrl = configuredRpcUrl();
  const commit = toolingCommit();
  const request = new FetchRequest(rpcUrl.toString());
  request.timeout = 10_000;
  const provider = new JsonRpcProvider(request, BASE_SEPOLIA_CHAIN_ID, {
    staticNetwork: true,
  });

  try {
    if (BigInt(await provider.send("eth_chainId", [])) !== BASE_SEPOLIA_CHAIN_ID) {
      fail("RPC ist nicht Base Sepolia.");
    }
    const finalizedBlock = await provider.getBlock("finalized");
    if (
      !finalizedBlock?.hash ||
      !finalizedBlock.parentHash ||
      finalizedBlock.number < FIXED_VESTING.deploymentBlockNumber ||
      BigInt(finalizedBlock.timestamp) < VESTING_START ||
      BigInt(finalizedBlock.timestamp) >= VESTING_CLIFF
    ) {
      fail("RPC liefert keinen geeigneten finalisierten Block vor dem Cliff.");
    }
    const blockTag = { blockTag: finalizedBlock.number };
    const token = new Contract(publicConfig.token, TOKEN_ABI, provider);
    const vesting = new Contract(publicConfig.vesting, VESTING_ABI, provider);
    const [
      deploymentBlock,
      tokenCode,
      vestingCode,
      beneficiaryCode,
      founderVesting,
      founderAllocation,
      vestingBalance,
      totalSupply,
      owner,
      start,
      cliff,
      end,
      duration,
      cliffDuration,
      vestingDuration,
      released,
      releasable,
      vestedAtObservation,
      vestedBeforeCliff,
      vestedAtCliff,
      vestedAtEnd,
      tokenLogs,
      vestingLogs,
    ] = await Promise.all([
      provider.getBlock(FIXED_VESTING.deploymentBlockNumber),
      provider.getCode(publicConfig.token, finalizedBlock.number),
      provider.getCode(publicConfig.vesting, finalizedBlock.number),
      provider.getCode(publicConfig.beneficiary, finalizedBlock.number),
      token.founderVesting(blockTag),
      token.FOUNDER_ALLOCATION(blockTag),
      token.balanceOf(publicConfig.vesting, blockTag),
      token.totalSupply(blockTag),
      vesting.owner(blockTag),
      vesting.start(blockTag),
      vesting.cliff(blockTag),
      vesting.end(blockTag),
      vesting.duration(blockTag),
      vesting.CLIFF_DURATION(blockTag),
      vesting.VESTING_DURATION(blockTag),
      vesting["released(address)"](publicConfig.token, blockTag),
      vesting["releasable(address)"](publicConfig.token, blockTag),
      vesting["vestedAmount(address,uint64)"](
        publicConfig.token,
        BigInt(finalizedBlock.timestamp),
        blockTag
      ),
      vesting["vestedAmount(address,uint64)"](
        publicConfig.token,
        VESTING_CLIFF - 1n,
        blockTag
      ),
      vesting["vestedAmount(address,uint64)"](
        publicConfig.token,
        VESTING_CLIFF,
        blockTag
      ),
      vesting["vestedAmount(address,uint64)"](
        publicConfig.token,
        VESTING_END,
        blockTag
      ),
      getLogsInChunks(
        provider,
        {
          address: publicConfig.token,
          topics: [new Interface(TOKEN_ABI).getEvent("Transfer").topicHash],
        },
        FIXED_VESTING.deploymentBlockNumber,
        finalizedBlock.number
      ),
      getLogsInChunks(
        provider,
        { address: publicConfig.vesting },
        FIXED_VESTING.deploymentBlockNumber,
        finalizedBlock.number
      ),
    ]);

    if (
      !deploymentBlock ||
      !sameHex(deploymentBlock.hash, FIXED_VESTING.deploymentBlockHash) ||
      tokenCode === "0x" ||
      vestingCode === "0x" ||
      keccak256(tokenCode) !== FIXED_VESTING.tokenRuntimeCodeHash ||
      keccak256(vestingCode) !== FIXED_VESTING.vestingRuntimeCodeHash ||
      beneficiaryCode !== "0x" ||
      getAddress(founderVesting) !== publicConfig.vesting ||
      founderAllocation !== FOUNDER_ALLOCATION ||
      vestingBalance !== FOUNDER_ALLOCATION ||
      totalSupply !== TOTAL_SUPPLY ||
      getAddress(owner) !== publicConfig.beneficiary ||
      start !== VESTING_START ||
      cliff !== VESTING_CLIFF ||
      end !== VESTING_END ||
      duration !== VESTING_DURATION_SECONDS ||
      cliffDuration !== CLIFF_DURATION_SECONDS ||
      vestingDuration !== VESTING_DURATION_SECONDS ||
      released !== 0n ||
      releasable !== 0n ||
      vestedAtObservation !== 0n ||
      vestedBeforeCliff !== 0n ||
      vestedAtCliff !== FOUNDER_ALLOCATION / 3n ||
      vestedAtEnd !== FOUNDER_ALLOCATION
    ) {
      fail("Finalisierter Vesting-Zustand widerspricht Manifest oder Zeitplan.");
    }

    const tokenInterface = new Interface(TOKEN_ABI);
    const parsedTransfers = tokenLogs.map((log) => ({
      event: tokenInterface.parseLog(log),
      log,
    }));
    const isInitialAllocation = ({ event, log }) =>
      getAddress(event.args.from) === ZeroAddress &&
      getAddress(event.args.to) === publicConfig.vesting &&
      BigInt(event.args.value) === FOUNDER_ALLOCATION &&
      log.blockNumber === FIXED_VESTING.deploymentBlockNumber &&
      sameHex(log.transactionHash, FIXED_VESTING.deploymentTransaction);
    const initialTransfers = parsedTransfers.filter(isInitialAllocation);
    const laterIncoming = parsedTransfers
      .filter(
        (entry) =>
          getAddress(entry.event.args.to) === publicConfig.vesting &&
          !isInitialAllocation(entry)
      )
      .map((entry) => entry.event);
    const outgoing = parsedTransfers
      .filter(
        ({ event }) => getAddress(event.args.from) === publicConfig.vesting
      )
      .map((entry) => entry.event);
    if (
      initialTransfers.length !== 1 ||
      sumValues(laterIncoming) !== 0n ||
      sumValues(outgoing) !== 0n
    ) {
      fail("Vesting-Transferhistorie widerspricht der intakten Founder-Allokation.");
    }

    const vestingInterface = new Interface(VESTING_ABI);
    const ownershipTopic = vestingInterface.getEvent("OwnershipTransferred").topicHash;
    const releaseTopic = vestingInterface.getEvent("ERC20Released").topicHash;
    const ownershipEvents = vestingLogs
      .filter((log) => sameHex(log.topics?.[0], ownershipTopic))
      .map((log) => ({ event: vestingInterface.parseLog(log), log }));
    const releaseEvents = vestingLogs
      .filter((log) => sameHex(log.topics?.[0], releaseTopic))
      .map((log) => vestingInterface.parseLog(log))
      .filter((event) => getAddress(event.args.token) === publicConfig.token);
    const releasedByEvents = releaseEvents.reduce(
      (total, event) => total + BigInt(event.args.amount),
      0n
    );
    if (
      ownershipEvents.length !== 1 ||
      ownershipEvents[0].log.blockNumber !==
        FIXED_VESTING.deploymentBlockNumber ||
      !sameHex(
        ownershipEvents[0].log.transactionHash,
        FIXED_VESTING.deploymentTransaction
      ) ||
      getAddress(ownershipEvents[0].event.args.previousOwner) !== ZeroAddress ||
      getAddress(ownershipEvents[0].event.args.newOwner) !==
        publicConfig.beneficiary ||
      releasedByEvents !== released
    ) {
      fail("Vesting-Ereignishistorie widerspricht Owner oder Released-Zustand.");
    }

    const [recheckedBlock, finalFinalizedBlock] = await Promise.all([
      provider.getBlock(finalizedBlock.number),
      provider.getBlock("finalized"),
    ]);
    if (
      !recheckedBlock ||
      !sameHex(recheckedBlock.hash, finalizedBlock.hash) ||
      !finalFinalizedBlock ||
      finalFinalizedBlock.number < finalizedBlock.number
    ) {
      fail("Finalisierter Beobachtungsblock änderte sich während des Checks.");
    }

    const evidence = createVestingEvidence({
      toolingCommit: commit,
      checkedAt: new Date().toISOString(),
      initialAllocationLogIndex: initialTransfers[0].log.index,
      ownershipTransferLogIndex: ownershipEvents[0].log.index,
      blockNumber: finalizedBlock.number,
      blockHash: finalizedBlock.hash,
      parentHash: finalizedBlock.parentHash,
      blockTimestamp: finalizedBlock.timestamp,
      finalizedBlockNumberAtCapture: finalFinalizedBlock.number,
      incomingTransferEventCount: laterIncoming.length,
      outgoingTransferEventCount: outgoing.length,
      erc20ReleaseEventCount: releaseEvents.length,
    });
    validateVestingEvidence(evidence);
    writeJsonAtomically(OUTPUT_PATH, evidence);
    console.log("Base-Sepolia-Vesting-Nachweis erfolgreich (ausschließlich lesend).");
    console.log(
      `Finalisierter Block ${finalizedBlock.number}; releasable(REIST) = 0.`
    );
    console.log("Keine Signatur, kein Keystore, kein Broadcast, keine Transaktion.");
  } finally {
    await provider.destroy();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    await main();
  } catch (error) {
    const message =
      error instanceof VestingObservationError
        ? error.message
        : "Unerwarteter Read-only-Fehler; Details wurden zum Schutz lokaler " +
          "RPC-Zugangsdaten unterdrückt.";
    console.error(`Fehler: ${message}`);
    process.exitCode = 1;
  }
}
