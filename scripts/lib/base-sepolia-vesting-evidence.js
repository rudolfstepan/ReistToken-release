import { getAddress, parseUnits } from "ethers";
import { BASE_SEPOLIA_CHAIN_ID } from "./base-sepolia-smoke-plan.js";
import { canonicalJsonSha256 } from "./build-provenance.js";

export const VESTING_OBSERVATION_ID =
  "reist-base-sepolia-founder-vesting-readonly-v1";
export const VESTING_EVIDENCE_PATH =
  "operations/base-sepolia-vesting-readonly.json";
export const VESTING_REQUIRED_FINALITY = "rpc-finalized";
export const FOUNDER_ALLOCATION = parseUnits("100000", 18);
export const TOTAL_SUPPLY = parseUnits("1000000", 18);
export const CLIFF_DURATION_SECONDS = 31_536_000n;
export const VESTING_DURATION_SECONDS = 94_608_000n;
export const VESTING_START = 1_785_685_290n;
export const VESTING_CLIFF = 1_817_221_290n;
export const VESTING_END = 1_880_293_290n;

export const EXPECTED_VESTING_TOOLING_COMMIT =
  "44f5c9bd1d80fe523034587868c26798d3f34337";
export const EXPECTED_VESTING_EVIDENCE_SHA256 =
  "EE9CF30DF6A8641016CDFCEF62BED3A7B5F5E989AD559BD574B80C0E88903BCB";

export const FIXED_VESTING = Object.freeze({
  deploymentTransaction:
    "0x4d8f54cd5cf2950ab1b2032c8f042ac16b3cc20fb65fca5221c0933df38f021c",
  deploymentBlockNumber: 44_958_501,
  deploymentBlockHash:
    "0x84e5975b36774a2e5b66bdbcc9d3b1729e2d2c59c09ef41067d47715c94899c5",
  token: "0xF2960B84525dF8Da9C038EA85AE5e3B4D0C26A68",
  founderVesting: "0x0A062Ff80791a96bda452A72094c98E87e3E67e6",
  beneficiary: "0xdc9F744C2D9e5962EC8839085ACADB5deFf585Ed",
  tokenRuntimeCodeHash:
    "0xd7b8b0e3c8e55a8221fa15e07c0f8cab75695e20660bb1a84cb645e2b3c63e38",
  vestingRuntimeCodeHash:
    "0x7cf933dcf909061a5bab1cd98fef3258354852aeb34f6b6407261fabf1de53ec",
});

function fail(message) {
  throw new Error(message);
}

function sameHex(actual, expected) {
  return String(actual || "").toLowerCase() === String(expected || "").toLowerCase();
}

function isHash(value) {
  const normalized = String(value || "");
  return (
    /^0x[0-9a-f]{64}$/i.test(normalized) &&
    !/^0x0{64}$/i.test(normalized)
  );
}

function safeInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function canonicalAddress(value, label) {
  try {
    return getAddress(String(value || ""));
  } catch {
    fail(`${label} ist keine gültige Ethereum-Adresse.`);
  }
}

export function validateVestingPublicConfiguration(
  deployment,
  roles,
  project,
  expectedCompleted = false
) {
  if (typeof expectedCompleted !== "boolean") {
    fail("Erwarteter Vesting-Beobachtungsstatus muss boolesch sein.");
  }
  if (
    deployment?.schemaVersion !== 2 ||
    deployment?.network !== "Base Sepolia" ||
    deployment?.chainId !== Number(BASE_SEPOLIA_CHAIN_ID) ||
    deployment?.verification?.sourceVerified !== true ||
    deployment?.verification?.externalAudit !== false ||
    !sameHex(deployment?.transactionHash, FIXED_VESTING.deploymentTransaction) ||
    deployment?.blockNumber !== FIXED_VESTING.deploymentBlockNumber ||
    !sameHex(deployment?.blockHash, FIXED_VESTING.deploymentBlockHash) ||
    canonicalAddress(deployment?.contracts?.token, "Manifest-Token") !==
      FIXED_VESTING.token ||
    canonicalAddress(
      deployment?.contracts?.founderVesting,
      "Manifest-Vesting"
    ) !== FIXED_VESTING.founderVesting ||
    !sameHex(
      deployment?.runtimeCodeHashes?.token,
      FIXED_VESTING.tokenRuntimeCodeHash
    ) ||
    !sameHex(
      deployment?.runtimeCodeHashes?.founderVesting,
      FIXED_VESTING.vestingRuntimeCodeHash
    ) ||
    deployment?.allocations?.founderVesting?.amount !== "100000" ||
    canonicalAddress(
      deployment?.allocations?.founderVesting?.beneficiary,
      "Manifest-Beneficiary"
    ) !== FIXED_VESTING.beneficiary ||
    canonicalAddress(
      deployment?.allocations?.founderVesting?.vestingContract,
      "Manifest-Vesting-Allokation"
    ) !== FIXED_VESTING.founderVesting ||
    BigInt(deployment?.allocations?.founderVesting?.start ?? -1) !==
      VESTING_START ||
    BigInt(deployment?.allocations?.founderVesting?.cliff ?? -1) !==
      VESTING_CLIFF ||
    BigInt(deployment?.allocations?.founderVesting?.end ?? -1) !== VESTING_END
  ) {
    fail("Deployment-Manifest bindet nicht das kanonische Founder-Vesting.");
  }

  if (
    roles?.schemaVersion !== 1 ||
    roles?.network !== "Base Sepolia" ||
    roles?.chainId !== Number(BASE_SEPOLIA_CHAIN_ID) ||
    roles?.status !== "base-sepolia-pilot-deployed-no-economic-value" ||
    canonicalAddress(
      roles?.roles?.founderBeneficiary,
      "Rollenregister-Beneficiary"
    ) !== FIXED_VESTING.beneficiary ||
    canonicalAddress(roles?.deployment?.token, "Rollenregister-Token") !==
      FIXED_VESTING.token ||
    canonicalAddress(
      roles?.deployment?.founderVesting,
      "Rollenregister-Vesting"
    ) !== FIXED_VESTING.founderVesting ||
    !sameHex(
      roles?.deployment?.transactionHash,
      FIXED_VESTING.deploymentTransaction
    )
  ) {
    fail("Rollenregister widerspricht dem kanonischen Founder-Vesting.");
  }

  if (
    project?.status?.testnetDeployment !== true ||
    project?.status?.sourceVerified !== true ||
    project?.status?.technicalTreasurySmoke !== true ||
    project?.status?.allowanceTestCompleted !== true ||
    (project?.status?.vestingReadOnlyCheckCompleted === true) !==
      expectedCompleted ||
    project?.status?.fullTestnetSmoke !== false ||
    project?.status?.mainnetDeployment !== false
  ) {
    fail("Projektstatus widerspricht dem erwarteten Vesting-Beobachtungsstatus.");
  }
  return {
    token: FIXED_VESTING.token,
    vesting: FIXED_VESTING.founderVesting,
    beneficiary: FIXED_VESTING.beneficiary,
  };
}

export function createVestingEvidence({
  toolingCommit,
  checkedAt,
  initialAllocationLogIndex,
  ownershipTransferLogIndex,
  blockNumber,
  blockHash,
  parentHash,
  blockTimestamp,
  finalizedBlockNumberAtCapture,
  incomingTransferEventCount,
  outgoingTransferEventCount,
  erc20ReleaseEventCount,
}) {
  return {
    schemaVersion: 1,
    observationId: VESTING_OBSERVATION_ID,
    status: "completed",
    mode: "read-only-rpc-finalized-snapshot",
    network: "Base Sepolia",
    chainId: Number(BASE_SEPOLIA_CHAIN_ID),
    toolingCommit,
    checkedAt,
    sourceDeployment: {
      manifest: "deployments/base-sepolia.json",
      transactionHash: FIXED_VESTING.deploymentTransaction,
      blockNumber: FIXED_VESTING.deploymentBlockNumber,
      blockHash: FIXED_VESTING.deploymentBlockHash,
      token: FIXED_VESTING.token,
      founderVesting: FIXED_VESTING.founderVesting,
      tokenRuntimeCodeHash: FIXED_VESTING.tokenRuntimeCodeHash,
      vestingRuntimeCodeHash: FIXED_VESTING.vestingRuntimeCodeHash,
      sourceVerified: true,
    },
    observation: {
      blockNumber,
      blockHash,
      parentHash,
      blockTimestamp,
      finality: VESTING_REQUIRED_FINALITY,
      finalizedBlockNumberAtCapture,
    },
    schedule: {
      beneficiary: FIXED_VESTING.beneficiary,
      start: Number(VESTING_START),
      cliff: Number(VESTING_CLIFF),
      end: Number(VESTING_END),
      startIso: new Date(Number(VESTING_START) * 1000).toISOString(),
      cliffIso: new Date(Number(VESTING_CLIFF) * 1000).toISOString(),
      endIso: new Date(Number(VESTING_END) * 1000).toISOString(),
      cliffDurationSeconds: CLIFF_DURATION_SECONDS.toString(),
      durationSeconds: VESTING_DURATION_SECONDS.toString(),
      secondsUntilCliff: (VESTING_CLIFF - BigInt(blockTimestamp)).toString(),
    },
    tokenState: {
      balanceAtVestingBaseUnits: FOUNDER_ALLOCATION.toString(),
      releasedBaseUnits: "0",
      releasableBaseUnits: "0",
      vestedAtObservationBaseUnits: "0",
      historicalAllocationBaseUnits: FOUNDER_ALLOCATION.toString(),
      totalSupplyBaseUnits: TOTAL_SUPPLY.toString(),
    },
    milestones: {
      vestedImmediatelyBeforeCliffBaseUnits: "0",
      vestedAtCliffBaseUnits: (FOUNDER_ALLOCATION / 3n).toString(),
      vestedAtEndBaseUnits: FOUNDER_ALLOCATION.toString(),
    },
    history: {
      initialAllocation: {
        transactionHash: FIXED_VESTING.deploymentTransaction,
        blockNumber: FIXED_VESTING.deploymentBlockNumber,
        logIndex: initialAllocationLogIndex,
        from: "0x0000000000000000000000000000000000000000",
        to: FIXED_VESTING.founderVesting,
        amountBaseUnits: FOUNDER_ALLOCATION.toString(),
      },
      laterIncomingTransfers: {
        eventCount: incomingTransferEventCount,
        amountBaseUnits: "0",
      },
      outgoingTransfers: {
        eventCount: outgoingTransferEventCount,
        amountBaseUnits: "0",
      },
      erc20ReleaseEvents: {
        eventCount: erc20ReleaseEventCount,
        amountBaseUnits: "0",
      },
      ownershipTransfer: {
        eventCount: 1,
        transactionHash: FIXED_VESTING.deploymentTransaction,
        blockNumber: FIXED_VESTING.deploymentBlockNumber,
        logIndex: ownershipTransferLogIndex,
        previousOwner: "0x0000000000000000000000000000000000000000",
        newOwner: FIXED_VESTING.beneficiary,
      },
    },
    validation: {
      finalizedBlockRechecked: true,
      deploymentBlockRechecked: true,
      runtimeCodeHashesMatchManifest: true,
      tokenReferencesVesting: true,
      beneficiaryHasNoRuntimeCodeAtObservation: true,
      ownerMatchesManifestBeneficiary: true,
      scheduleMatchesManifest: true,
      allocationIntact: true,
      observationBeforeCliff: true,
      zeroReleasedBeforeCliff: true,
      zeroReleasableBeforeCliff: true,
      noPostDeploymentTokenMovement: true,
    },
    readOnlyExecution: {
      keystoreRead: false,
      signerUsed: false,
      signaturesCreated: 0,
      transactionsBroadcast: 0,
      transactionHashes: [],
    },
    scope:
      "Point-in-time finalized Base Sepolia observation before the cliff; not an audit, payout, transaction, or future guarantee.",
    economicValue: "none-promised-testnet-only",
  };
}

export function validateVestingEvidence(evidence) {
  const checkedAt = new Date(evidence?.checkedAt);
  if (
    !/^[0-9a-f]{40}$/.test(String(evidence?.toolingCommit || "")) ||
    evidence.toolingCommit !== EXPECTED_VESTING_TOOLING_COMMIT ||
    !safeInteger(evidence?.observation?.blockNumber) ||
    evidence.observation.blockNumber < FIXED_VESTING.deploymentBlockNumber ||
    !isHash(evidence?.observation?.blockHash) ||
    !isHash(evidence?.observation?.parentHash) ||
    !safeInteger(evidence?.observation?.blockTimestamp) ||
    BigInt(evidence.observation.blockTimestamp) < VESTING_START ||
    BigInt(evidence.observation.blockTimestamp) >= VESTING_CLIFF ||
    !safeInteger(evidence?.observation?.finalizedBlockNumberAtCapture) ||
    evidence.observation.finalizedBlockNumberAtCapture <
      evidence.observation.blockNumber ||
    Number.isNaN(checkedAt.getTime()) ||
    checkedAt.toISOString() !== evidence.checkedAt ||
    checkedAt.getTime() < evidence.observation.blockTimestamp * 1000
  ) {
    fail("Vesting-Nachweis enthält keine gültige finalisierte Blockbindung.");
  }
  for (const count of [
    evidence?.history?.laterIncomingTransfers?.eventCount,
    evidence?.history?.outgoingTransfers?.eventCount,
    evidence?.history?.erc20ReleaseEvents?.eventCount,
  ]) {
    if (!Number.isSafeInteger(count) || count < 0) {
      fail("Vesting-Nachweis enthält eine ungültige Ereignisanzahl.");
    }
  }
  for (const logIndex of [
    evidence?.history?.initialAllocation?.logIndex,
    evidence?.history?.ownershipTransfer?.logIndex,
  ]) {
    if (!Number.isSafeInteger(logIndex) || logIndex < 0) {
      fail("Vesting-Nachweis enthält einen ungültigen Ereignisindex.");
    }
  }

  const expected = createVestingEvidence({
    toolingCommit: evidence.toolingCommit,
    checkedAt: evidence.checkedAt,
    initialAllocationLogIndex: evidence.history.initialAllocation.logIndex,
    ownershipTransferLogIndex: evidence.history.ownershipTransfer.logIndex,
    blockNumber: evidence.observation.blockNumber,
    blockHash: evidence.observation.blockHash,
    parentHash: evidence.observation.parentHash,
    blockTimestamp: evidence.observation.blockTimestamp,
    finalizedBlockNumberAtCapture:
      evidence.observation.finalizedBlockNumberAtCapture,
    incomingTransferEventCount:
      evidence.history.laterIncomingTransfers.eventCount,
    outgoingTransferEventCount: evidence.history.outgoingTransfers.eventCount,
    erc20ReleaseEventCount: evidence.history.erc20ReleaseEvents.eventCount,
  });
  if (JSON.stringify(evidence) !== JSON.stringify(expected)) {
    fail("Vesting-Nachweis weicht vom exakt gebundenen Read-only-Schema ab.");
  }
  if (canonicalJsonSha256(evidence) !== EXPECTED_VESTING_EVIDENCE_SHA256) {
    fail("Vesting-Nachweis weicht vom eingefrorenen kanonischen Snapshot ab.");
  }
  return expected;
}
