import { HardhatUserConfig } from "hardhat/config";

// PLUGINS
import "@gelatonetwork/web3-functions-sdk/hardhat-plugin";
import "@nomicfoundation/hardhat-chai-matchers";
import "@nomiclabs/hardhat-etherscan";
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
    networks: ["hardhat", "raspberry"], //(multiChainProvider) injects provider for these networks
  },
  // hardhat-deploy
  namedAccounts: {
    deployer: {
      default: 0,
    },
    gelatoMsgSender: {
      hardhat: "0xbb97656cd5fece3a643335d03c8919d5e7dcd225",
      raspberry:"0xbb97656cd5fece3a643335d03c8919d5e7dcd225"
    },
    pyth: {
      hardhat: "0xA2aa501b19aff244D90cc15a4Cf739D2725B5729",
      raspberry:"0xA2aa501b19aff244D90cc15a4Cf739D2725B5729"
    },


  },
  defaultNetwork: "hardhat",

  networks: {
    hardhat: {
      forking: {
        url:`https://rpc.opcelestia-raspberry.gelato.digital`,
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
    },
    raspberry: {
      accounts: PK ? [PK] : [],
      chainId: 123420111,
      url: `https://rpc.opcelestia-raspberry.gelato.digital`,
    },
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
  etherscan: {
    apiKey: {
      raspberry: "xxx"
    },
    customChains: [
      {
        network: "raspberry",
        chainId: 123420111,
        urls: {
          apiURL: "https://opcelestia-raspberry.gelatoscout.com/api",
          browserURL: "https://opcelestia-raspberry.gelatoscout.com/"
        }
      }
    ]
  },
};

export default config;
