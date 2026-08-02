import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  FIXED_VESTING,
  EXPECTED_VESTING_TOOLING_COMMIT,
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
    toolingCommit: EXPECTED_VESTING_TOOLING_COMMIT,
    checkedAt: "2026-08-02T20:33:10.421Z",
    initialAllocationLogIndex: 28,
    ownershipTransferLogIndex: 25,
    blockNumber: 44_966_505,
    blockHash:
      "0xa738b375aff6433fe7382bd0e939d0ba39cf8631616eba88fe751f2d2202c965",
    parentHash:
      "0x9754f59f055c31003967dc2397493f75ad54f44a17a7275a544d7e9f85dee11a",
    blockTimestamp: 1_785_701_298,
    finalizedBlockNumberAtCapture: 44_966_505,
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
  assert.deepEqual(
    readJson("operations/base-sepolia-vesting-readonly.json"),
    evidence
  );
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
    (copy) => { copy.toolingCommit = "cd".repeat(20); },
    (copy) => { copy.checkedAt = "2026-08-02T20:33:11.421Z"; },
    (copy) => { copy.observation.finality = "latest"; },
    (copy) => { copy.observation.blockHash = `0x${"00".repeat(32)}`; },
    (copy) => { copy.observation.blockHash = `0x${"44".repeat(32)}`; },
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
