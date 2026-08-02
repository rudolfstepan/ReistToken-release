import assert from "node:assert/strict";
import test from "node:test";
import {
  assertDeploymentReceipt,
  assertDeploymentTransaction,
  assertRuntimeMatchesArtifact,
} from "../finalize-testnet-deployment.js";

const deployer = "0xCfE0Cbb18351C31E00778fEa42b4b260112Aa48e";
const token = "0x1111111111111111111111111111111111111111";
const transactionHash = `0x${"ab".repeat(32)}`;

test("accepts only the exact deployment transaction identity", () => {
  const expected = {
    transactionHash,
    chainId: 84532n,
    deployer,
    nonce: 0,
    initCode: "0x60006000",
  };
  const transaction = {
    hash: transactionHash,
    chainId: 84532n,
    from: deployer,
    to: null,
    nonce: 0,
    value: 0n,
    data: "0x60006000",
  };

  assert.doesNotThrow(() => assertDeploymentTransaction(transaction, expected));
  assert.throws(
    () =>
      assertDeploymentTransaction(
        { ...transaction, data: "0x60016000" },
        expected
      ),
    /Initcode/
  );
  assert.throws(
    () => assertDeploymentTransaction({ ...transaction, nonce: 1 }, expected),
    /Nonce 0/
  );
  assert.throws(
    () => assertDeploymentTransaction({ ...transaction, to: token }, expected),
    /Vertragserstellung/
  );
});

test("requires a successful receipt at the predicted token address", () => {
  const expected = { transactionHash, deployer, tokenAddress: token };
  const receipt = {
    status: 1,
    hash: transactionHash,
    from: deployer,
    to: null,
    contractAddress: token,
  };

  assert.doesNotThrow(() => assertDeploymentReceipt(receipt, expected));
  assert.throws(
    () => assertDeploymentReceipt({ ...receipt, status: 0 }, expected),
    /keinen Erfolg/
  );
  assert.throws(
    () =>
      assertDeploymentReceipt(
        { ...receipt, contractAddress: "0x2222222222222222222222222222222222222222" },
        expected
      ),
    /vorhergesagten Token-Adresse/
  );
});

test("runtime validation permits only declared immutable byte ranges", () => {
  const artifact = {
    deployedBytecode: "0x600011226000",
    immutableReferences: {
      "1": [{ start: 2, length: 2 }],
    },
  };

  assert.doesNotThrow(() =>
    assertRuntimeMatchesArtifact("0x6000aabb6000", artifact, "Test")
  );
  assert.throws(
    () => assertRuntimeMatchesArtifact("0x6100aabb6000", artifact, "Test"),
    /ausserhalb der Immutables/
  );
  assert.throws(
    () => assertRuntimeMatchesArtifact("0x6000aabb60", artifact, "Test"),
    /kompilierte Laenge/
  );
});
