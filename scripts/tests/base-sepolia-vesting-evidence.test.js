import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  FIXED_VESTING,
  VESTING_CLIFF,
  VESTING_START,
  createVestingEvidence,
  validateVestingEvidence,
  validateVestingPublicConfiguration,
} from "../lib/base-sepolia-vesting-evidence.js";

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function evidenceFixture() {
  return createVestingEvidence({
    toolingCommit: "ab".repeat(20),
    checkedAt: new Date(Number(VESTING_START + 1_005n) * 1000).toISOString(),
    initialAllocationLogIndex: 2,
    ownershipTransferLogIndex: 0,
    blockNumber: 44_965_000,
    blockHash: `0x${"11".repeat(32)}`,
    parentHash: `0x${"22".repeat(32)}`,
    blockTimestamp: Number(VESTING_START + 1_000n),
    finalizedBlockNumberAtCapture: 44_965_001,
    incomingTransferEventCount: 0,
    outgoingTransferEventCount: 0,
    erc20ReleaseEventCount: 0,
  });
}

test("public vesting configuration separates prepared and completed observation", () => {
  const deployment = readJson("deployments/base-sepolia.json");
  const roles = readJson("data/testnet-roles.json");
  const project = readJson("data/project.json");
  const prepared = structuredClone(project);
  delete prepared.status.vestingReadOnlyCheckCompleted;
  assert.deepEqual(
    validateVestingPublicConfiguration(deployment, roles, prepared, false),
    {
      token: FIXED_VESTING.token,
      vesting: FIXED_VESTING.founderVesting,
      beneficiary: FIXED_VESTING.beneficiary,
    }
  );
  const completed = structuredClone(project);
  completed.status.vestingReadOnlyCheckCompleted = true;
  assert.doesNotThrow(() =>
    validateVestingPublicConfiguration(deployment, roles, completed, true)
  );
  assert.throws(() =>
    validateVestingPublicConfiguration(deployment, roles, completed, false)
  );
  assert.throws(() =>
    validateVestingPublicConfiguration(deployment, roles, prepared, true)
  );

  for (const mutate of [
    (copy) => { copy.deployment.contracts.founderVesting = FIXED_VESTING.token; },
    (copy) => { copy.deployment.allocations.founderVesting.cliff += 1; },
    (copy) => { copy.deployment.runtimeCodeHashes.founderVesting = `0x${"00".repeat(32)}`; },
    (copy) => { copy.roles.roles.founderBeneficiary = FIXED_VESTING.token; },
    (copy) => { copy.project.status.allowanceTestCompleted = false; },
    (copy) => { copy.project.status.fullTestnetSmoke = true; },
  ]) {
    const copy = {
      deployment: structuredClone(deployment),
      roles: structuredClone(roles),
      project: structuredClone(prepared),
    };
    mutate(copy);
    assert.throws(() =>
      validateVestingPublicConfiguration(
        copy.deployment,
        copy.roles,
        copy.project,
        false
      )
    );
  }
});

test("vesting evidence is a finalized read-only pre-cliff snapshot", () => {
  const evidence = evidenceFixture();
  assert.doesNotThrow(() => validateVestingEvidence(evidence));
  assert.equal(evidence.readOnlyExecution.keystoreRead, false);
  assert.equal(evidence.readOnlyExecution.signerUsed, false);
  assert.equal(evidence.readOnlyExecution.signaturesCreated, 0);
  assert.equal(evidence.readOnlyExecution.transactionsBroadcast, 0);
  assert.deepEqual(evidence.readOnlyExecution.transactionHashes, []);
  assert.equal(
    evidence.validation.beneficiaryHasNoRuntimeCodeAtObservation,
    true
  );
  assert.equal(
    evidence.schedule.secondsUntilCliff,
    (VESTING_CLIFF - BigInt(evidence.observation.blockTimestamp)).toString()
  );

  for (const mutate of [
    (copy) => { copy.status = "prepared"; },
    (copy) => { copy.mode = "transaction"; },
    (copy) => { copy.toolingCommit = "00"; },
    (copy) => { copy.checkedAt = "not-an-instant"; },
    (copy) => { copy.observation.finality = "latest"; },
    (copy) => { copy.observation.blockHash = `0x${"00".repeat(32)}`; },
    (copy) => { copy.observation.blockTimestamp = Number(VESTING_CLIFF); },
    (copy) => { copy.observation.finalizedBlockNumberAtCapture = copy.observation.blockNumber - 1; },
    (copy) => { copy.schedule.end += 1; },
    (copy) => { copy.tokenState.releasableBaseUnits = "1"; },
    (copy) => { copy.milestones.vestedAtCliffBaseUnits = "0"; },
    (copy) => { copy.history.laterIncomingTransfers.amountBaseUnits = "1"; },
    (copy) => { copy.history.outgoingTransfers.eventCount = -1; },
    (copy) => { copy.history.ownershipTransfer.logIndex = -1; },
    (copy) => { copy.validation.observationBeforeCliff = false; },
    (copy) => { copy.validation.beneficiaryHasNoRuntimeCodeAtObservation = false; },
    (copy) => { copy.readOnlyExecution.signaturesCreated = 1; },
    (copy) => { copy.readOnlyExecution.transactionHashes.push(`0x${"33".repeat(32)}`); },
  ]) {
    const copy = structuredClone(evidence);
    mutate(copy);
    assert.throws(() => validateVestingEvidence(copy));
  }
});
