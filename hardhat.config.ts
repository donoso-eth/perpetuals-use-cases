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
    }

  },
  defaultNetwork: "rootStock",

  networks: {
    hardhat: {
      forking: {
       // url:`https://public-node.rsk.co`,
        url: `https://rpc.arb-blueberry.gelato.digital`,
      },
    },
    blueberry: {
      accounts: PK ? [PK] : [],
      chainId: 88153591557,
      url: `https://rpc.arb-blueberry.gelato.digital`,
    },
    rootStock: {
      accounts: PK ? [PK] : [],
       chainId: 30,
      // `https://rpc.testnet.rootstock.io/EKl2vnE6zr3xHp6V3AzBd8DckKiZ8t-T`
      url:`https://public-node.rsk.co`,
      // chainId: 31,
      gasPrice: 60000000,
    },
    rootStockTestnet: {
      accounts: PK ? [PK] : [],
      // chainId: 31,
      // url: 
      // `https://rpc.testnet.rootstock.io/EKl2vnE6zr3xHp6V3AzBd8DckKiZ8t-T`
      url: "https://public-node.testnet.rsk.co",
      chainId: 31,
      gasPrice: 60000000,
    },
    ethereum: {
      accounts: PK ? [PK] : [],
      chainId: 1,
      url: `https://eth-mainnet.alchemyapi.io/v2/${ALCHEMY_ID}`,
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
        version: "0.8.23",
        settings: {
          optimizer: { enabled: true, runs: 999999 },
          // Some networks don't support opcode PUSH0, we need to override evmVersion
          // See https://stackoverflow.com/questions/76328677/remix-returned-error-jsonrpc2-0-errorinvalid-opcode-push0-id24
          evmVersion: "paris",
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
      raspberry: "abc",
      rootStock:"333",
      blueberry:"XXX"
    },
    customChains: [
      {
        network: "raspberry",
        chainId: 123420111,
        urls: {
          apiURL: "https://opcelestia-raspberry.gelatoscout.com/api",
          browserURL: "https://opcelestia-raspberry.gelatoscout.com/"
        }
      },
      {
        network: "rootStock",
        chainId: 30,
        urls: {
          apiURL: "https://rootstock.blockscout.com/api",
          browserURL: "https://rootstock.blockscout.com/"
        }
      },
      {
        network: "blueberry",
        chainId: 88153591557,
        urls: {
          apiURL: "https://arb-blueberry.gelatoscout.com/api",
          browserURL: "https://arb-blueberry.gelatoscout.com"
        }
      }
    ]
  },
};

export default config;
