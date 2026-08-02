import { expect } from "chai";
import hre from "hardhat";

const { ethers, networkHelpers } = await hre.network.create("hardhatOp");

const TOTAL_SUPPLY = ethers.parseUnits("1000000", 18);
const RESEARCH_ALLOCATION = ethers.parseUnits("700000", 18);
const ECOSYSTEM_ALLOCATION = ethers.parseUnits("200000", 18);
const FOUNDER_ALLOCATION = ethers.parseUnits("100000", 18);
const ONE_YEAR = 365n * 24n * 60n * 60n;
const THREE_YEARS = 3n * ONE_YEAR;

async function deployFixture() {
  const [deployer, founder, research, ecosystem, user, newBeneficiary] =
    await ethers.getSigners();

  const founderAddress = await founder.getAddress();
  const researchAddress = await research.getAddress();
  const ecosystemAddress = await ecosystem.getAddress();

  const token = await ethers.deployContract("REISTToken", [
    founderAddress,
    researchAddress,
    ecosystemAddress,
  ]);
  await token.waitForDeployment();

  const vestingAddress = await token.founderVesting();
  const vesting = await ethers.getContractAt(
    "REISTFounderVesting",
    vestingAddress
  );

  return {
    token,
    vesting,
    deployer,
    founder,
    research,
    ecosystem,
    user,
    newBeneficiary,
    founderAddress,
    researchAddress,
    ecosystemAddress,
    vestingAddress,
  };
}

async function expectDeploymentError(constructorArgs, errorName) {
  let deploymentError;

  try {
    const token = await ethers.deployContract("REISTToken", constructorArgs);
    await token.waitForDeployment();
  } catch (error) {
    deploymentError = error;
  }

  expect(deploymentError, `expected ${errorName}`).to.not.equal(undefined);
  expect(deploymentError.message).to.include(`'${errorName}()'`);
}

describe("REISTToken", function () {
  it("uses the research-token identity", async function () {
    const { token } = await networkHelpers.loadFixture(deployFixture);

    expect(await token.name()).to.equal("REIST Research Token");
    expect(await token.symbol()).to.equal("REIST");
    expect(await token.decimals()).to.equal(18n);
  });

  it("creates the fixed allocation without rewarding the deployer", async function () {
    const {
      token,
      deployer,
      researchAddress,
      ecosystemAddress,
      vestingAddress,
    } = await networkHelpers.loadFixture(deployFixture);

    expect(await token.totalSupply()).to.equal(TOTAL_SUPPLY);
    expect(await token.MAX_SUPPLY()).to.equal(TOTAL_SUPPLY);
    expect(await token.balanceOf(researchAddress)).to.equal(RESEARCH_ALLOCATION);
    expect(await token.balanceOf(ecosystemAddress)).to.equal(ECOSYSTEM_ALLOCATION);
    expect(await token.balanceOf(vestingAddress)).to.equal(FOUNDER_ALLOCATION);
    expect(await token.balanceOf(await deployer.getAddress())).to.equal(0n);
    expect(await token.balanceOf(await token.getAddress())).to.equal(0n);
  });

  it("rejects every zero allocation address", async function () {
    const [, founder, research, ecosystem] = await ethers.getSigners();
    const addresses = await Promise.all(
      [founder, research, ecosystem].map((signer) => signer.getAddress())
    );

    for (let index = 0; index < 3; index += 1) {
      const args = [...addresses];
      args[index] = ethers.ZeroAddress;
      await expectDeploymentError(args, "InvalidAllocationAddress");
    }
  });

  it("rejects duplicate allocation roles", async function () {
    const [, founder, research, ecosystem] = await ethers.getSigners();
    const addresses = await Promise.all(
      [founder, research, ecosystem].map((signer) => signer.getAddress())
    );

    for (const [left, right] of [
      [0, 1],
      [0, 2],
      [1, 2],
    ]) {
      const args = [...addresses];
      args[right] = args[left];
      await expectDeploymentError(args, "DuplicateAllocationAddress");
    }
  });

  it("rejects the direct deployment address in every allocation role", async function () {
    const [deployer, founder, research, ecosystem] = await ethers.getSigners();
    const deployerAddress = await deployer.getAddress();
    const addresses = await Promise.all(
      [founder, research, ecosystem].map((signer) => signer.getAddress())
    );

    for (let index = 0; index < 3; index += 1) {
      const args = [...addresses];
      args[index] = deployerAddress;
      await expectDeploymentError(args, "DeployerIsAllocationRecipient");
    }
  });

  it("supports standard transfers and allowances", async function () {
    const { token, research, user } = await networkHelpers.loadFixture(deployFixture);
    const userAddress = await user.getAddress();
    const researchAddress = await research.getAddress();
    const amount = ethers.parseUnits("250", 18);

    await expect(token.connect(research).transfer(userAddress, amount))
      .to.emit(token, "Transfer")
      .withArgs(researchAddress, userAddress, amount);

    await token.connect(user).approve(researchAddress, amount);
    await token
      .connect(research)
      .transferFrom(userAddress, researchAddress, amount);

    expect(await token.balanceOf(userAddress)).to.equal(0n);
    expect(await token.totalSupply()).to.equal(TOTAL_SUPPLY);
  });

  it("exposes no minting, pausing, tax, blacklist, or owner API", async function () {
    const { token } = await networkHelpers.loadFixture(deployFixture);
    const names = new Set(
      token.interface.fragments
        .filter((fragment) => fragment.type === "function")
        .map((fragment) => fragment.name)
    );

    for (const forbidden of [
      "mint",
      "pause",
      "unpause",
      "blacklist",
      "setTax",
      "owner",
      "upgradeToAndCall",
    ]) {
      expect(names.has(forbidden), forbidden).to.equal(false);
    }
  });
});

describe("REISTFounderVesting", function () {
  it("records the beneficiary and exact schedule", async function () {
    const { vesting, founderAddress } = await networkHelpers.loadFixture(deployFixture);

    expect(await vesting.owner()).to.equal(founderAddress);
    expect(await vesting.duration()).to.equal(THREE_YEARS);
    expect(await vesting.cliff()).to.equal((await vesting.start()) + ONE_YEAR);
    expect(await vesting.end()).to.equal((await vesting.start()) + THREE_YEARS);
  });

  it("releases nothing before the one-year cliff", async function () {
    const { token, vesting } = await networkHelpers.loadFixture(deployFixture);
    const tokenAddress = await token.getAddress();
    const cliff = await vesting.cliff();

    await networkHelpers.time.increaseTo(cliff - 1n);
    expect(
      await vesting["vestedAmount(address,uint64)"](tokenAddress, cliff - 1n)
    ).to.equal(0n);
    expect(await vesting["releasable(address)"](tokenAddress)).to.equal(0n);
  });

  it("vests one third at the cliff and permits public release only to the beneficiary", async function () {
    const { token, vesting, founderAddress, user } =
      await networkHelpers.loadFixture(deployFixture);
    const tokenAddress = await token.getAddress();
    const cliff = await vesting.cliff();
    const expectedAtCliff = (FOUNDER_ALLOCATION * ONE_YEAR) / THREE_YEARS;

    expect(
      await vesting["vestedAmount(address,uint64)"](tokenAddress, cliff)
    ).to.equal(expectedAtCliff);

    await networkHelpers.time.setNextBlockTimestamp(cliff);
    await vesting.connect(user)["release(address)"](tokenAddress);
    expect(await token.balanceOf(founderAddress)).to.equal(expectedAtCliff);
    expect(await token.balanceOf(await user.getAddress())).to.equal(0n);
  });

  it("releases the complete founder allocation by the end", async function () {
    const { token, vesting, founderAddress } =
      await networkHelpers.loadFixture(deployFixture);
    const tokenAddress = await token.getAddress();

    await networkHelpers.time.increaseTo(await vesting.end());
    await vesting["release(address)"](tokenAddress);

    expect(await token.balanceOf(founderAddress)).to.equal(FOUNDER_ALLOCATION);
    expect(await token.balanceOf(await vesting.getAddress())).to.equal(0n);
    expect(await token.totalSupply()).to.equal(TOTAL_SUPPLY);
  });

  it("does not accelerate vesting when beneficiary rights are transferred", async function () {
    const { token, vesting, founder, founderAddress, newBeneficiary } =
      await networkHelpers.loadFixture(deployFixture);
    const tokenAddress = await token.getAddress();
    const newBeneficiaryAddress = await newBeneficiary.getAddress();
    const before = await vesting["releasable(address)"](tokenAddress);

    await vesting.connect(founder).transferOwnership(newBeneficiaryAddress);

    expect(await vesting.owner()).to.equal(newBeneficiaryAddress);
    expect(await vesting["releasable(address)"](tokenAddress)).to.equal(before);

    await networkHelpers.time.setNextBlockTimestamp(await vesting.cliff());
    await vesting["release(address)"](tokenAddress);
    expect(await token.balanceOf(founderAddress)).to.equal(0n);
    expect(await token.balanceOf(newBeneficiaryAddress)).to.equal(
      FOUNDER_ALLOCATION / 3n
    );
  });

  it("supports partial and repeated releases without exceeding the schedule", async function () {
    const { token, vesting, founderAddress } =
      await networkHelpers.loadFixture(deployFixture);
    const tokenAddress = await token.getAddress();
    const twoYears = (await vesting.start()) + 2n * ONE_YEAR;

    await networkHelpers.time.setNextBlockTimestamp(await vesting.cliff());
    await vesting["release(address)"](tokenAddress);
    await networkHelpers.time.setNextBlockTimestamp(twoYears);
    await vesting["release(address)"](tokenAddress);
    const releasedAtTwoYears = await token.balanceOf(founderAddress);
    expect(releasedAtTwoYears).to.equal((FOUNDER_ALLOCATION * 2n) / 3n);

    expect(await vesting["releasable(address)"](tokenAddress)).to.equal(0n);
    expect(await token.totalSupply()).to.equal(TOTAL_SUPPLY);
  });

  it("prevents accidental ownership renunciation and permanent token lock", async function () {
    const { vesting, founder } = await networkHelpers.loadFixture(deployFixture);

    await expect(vesting.connect(founder).renounceOwnership())
      .to.be.revertedWithCustomError(vesting, "OwnershipRenunciationDisabled");
  });
});
