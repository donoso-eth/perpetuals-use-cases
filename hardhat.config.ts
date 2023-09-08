import { HardhatUserConfig } from "hardhat/config";

// PLUGINS
import "@gelatonetwork/web3-functions-sdk/hardhat-plugin";
import "@nomicfoundation/hardhat-chai-matchers";
import "@nomiclabs/hardhat-ethers";
import "@typechain/hardhat";
import "hardhat-deploy";

// Process Env Variables
import * as dotenv from "dotenv";
dotenv.config({ path: __dirname + "/.env" });

const PK = process.env.PK;
const ALCHEMY_ID = process.env.ALCHEMY_ID;
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY;


// HardhatUserConfig bug
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const config: HardhatUserConfig = {
  // web3 functions
  w3f: {
    rootDir: "./web3-functions",
    debug: false,
    networks: ["arbitriumGoerli","hardhat", "mumbai"], //(multiChainProvider) injects provider for these networks
  },
  // hardhat-deploy
  namedAccounts: {
    deployer: {
      default: 0,
    },
    gelatoMsgSender: {
      hardhat: "0xbb97656cd5fece3a643335d03c8919d5e7dcd225",
      mumbai: "0xcc53666e25BF52C7c5Bc1e8F6E1F6bf58E871659",
      polygon: "0xcc53666e25BF52C7c5Bc1e8F6E1F6bf58E871659",
      arbitrium:"0xbb97656cd5fece3a643335d03c8919d5e7dcd225",
      arbitriumGoerli:"0xbb97656cd5fece3a643335d03c8919d5e7dcd225"
    },
    pyth: {
      hardhat: "0xff1a0f4744e8582DF1aE09D5611b887B6a12925C",
      mumbai: "0xff1a0f4744e8582DF1aE09D5611b887B6a12925C",
      polygon: "0xff1a0f4744e8582DF1aE09D5611b887B6a12925C",
      arbitrium:"0xff1a0f4744e8582DF1aE09D5611b887B6a12925C",
      arbitriumGoerli:"0xff1a0f4744e8582DF1aE09D5611b887B6a12925C"
    },


  },
  defaultNetwork: "arbitriumGoerli",

  networks: {
    hardhat: {
      forking: {
        //url:`https://arb-mainnet.g.alchemy.com/v2/${ALCHEMY_ID}`,
        url:`https://arb-goerli.g.alchemy.com/v2/${ALCHEMY_ID}`,
       // blockNumber: 35241432,
      },
    },

    ethereum: {
      accounts: PK ? [PK] : [],
      chainId: 1,
      url: `https://eth-mainnet.alchemyapi.io/v2/${ALCHEMY_ID}`,
    },
    mumbai: {
      accounts: PK ? [PK] : [],
      chainId: 80001,
      url: `https://polygon-mumbai.g.alchemy.com/v2/${ALCHEMY_ID}`,
    },
    polygon: {
      accounts: PK ? [PK] : [],
      chainId: 137,
      url: "https://polygon-rpc.com",
    },
    arbitrium:{
      url:`https://arb-mainnet.g.alchemy.com/v2/${ALCHEMY_ID}`,
      accounts: PK ? [PK] : [],
      chainId: 42161,
    },
    arbitriumGoerli:{
      url:`https://arb-goerli.g.alchemy.com/v2/${ALCHEMY_ID}`,
      accounts: PK ? [PK] : [],
      chainId: 421613,
    }
  },

  solidity: {
    compilers: [
      {
        version: "0.8.18",
        settings: {
          optimizer: { enabled: true, runs: 200 },
        },
      },
    ],
  },

  typechain: {
    outDir: "typechain",
    target: "ethers-v5",
  },

  // hardhat-deploy
  verify: {
    etherscan: {
      apiKey: ETHERSCAN_API_KEY ? ETHERSCAN_API_KEY : "",
    },
  },
};

export default config;
