import "dotenv/config";
import { configVariable, defineConfig } from "hardhat/config";
import hardhatEthers from "@nomicfoundation/hardhat-ethers";
import hardhatEthersChaiMatchers from "@nomicfoundation/hardhat-ethers-chai-matchers";
import hardhatMocha from "@nomicfoundation/hardhat-mocha";
import hardhatNetworkHelpers from "@nomicfoundation/hardhat-network-helpers";

export default defineConfig({
  plugins: [
    hardhatEthers,
    hardhatEthersChaiMatchers,
    hardhatMocha,
    hardhatNetworkHelpers,
  ],
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      evmVersion: "cancun",
      metadata: {
        bytecodeHash: "ipfs",
      },
    },
  },
  networks: {
    hardhatOp: {
      type: "edr-simulated",
      chainType: "op",
    },
    baseSepolia: {
      type: "http",
      chainType: "op",
      chainId: 84532,
      url: configVariable("BASE_SEPOLIA_RPC_URL"),
      accounts: [configVariable("TESTNET_DEPLOYER_PRIVATE_KEY")],
    },
  },
});
