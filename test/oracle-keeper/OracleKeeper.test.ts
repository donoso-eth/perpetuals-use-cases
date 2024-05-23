import hre from "hardhat";
import { Signer } from "@ethersproject/abstract-signer";
import { EvmPriceServiceConnection } from "@pythnetwork/pyth-evm-js";

import { setBalance } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { PerpMock } from "../../typechain/contracts/PerpMock";
import { utils } from "ethers";
import { fastForwardTime, getTimeStampNow } from "../utils";
import { Log } from "@ethersproject/providers";
import { getLogs } from "../utils/getLogs";
import {

  Web3FunctionResultCallData,
} from "@gelatonetwork/web3-functions-sdk";
import { Web3FunctionHardhat } from "@gelatonetwork/web3-functions-sdk/hardhat-plugin";
import { sleep } from "../../web3-functions/utils";
import { priceFeedPyth, serverPyth } from "../constants";

const { ethers, deployments, w3f } = hre;

describe.only("PerpMock set Orders contract tests", function () {
  let admin: Signer; // proxyAdmin
  let adminAddress: string;
  let perpMock: PerpMock;
  let gelatoMsgSenderSigner: Signer;
  let genesisBlock: number;
  let priceFeed:string = "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace", priceFeedPyth

  beforeEach(async function () {
    if (hre.network.name !== "hardhat") {
      console.error("Test Suite is meant to be run on hardhat only");
      process.exit(1);
    }

    await deployments.fixture();

    [admin] = await ethers.getSigners();

    adminAddress = await admin.getAddress();
    await setBalance(adminAddress, ethers.utils.parseEther("1000"));
    const { gelatoMsgSender } = await hre.getNamedAccounts();
    gelatoMsgSenderSigner = await ethers.getSigner(gelatoMsgSender);

    perpMock = (await ethers.getContractAt(
      "PerpMock",
      (
        await deployments.get("PerpMock")
      ).address
    )) as PerpMock;
    await setBalance(perpMock.address, utils.parseEther("10000000000000"));
    await setBalance(gelatoMsgSender, utils.parseEther("10000000000000"));
    genesisBlock = await hre.ethers.provider.getBlockNumber();



  });
  it("PerpMock.updatePrice: correct", async () => { 
    await perpMock.setOrder(2);
    await perpMock.setOrder(3);


    let currentBlock = await hre.ethers.provider.getBlockNumber();
    let lastBlock = genesisBlock;
   

    const topics = [
      perpMock.interface.getEventTopic(
        "setOrderEvent(uint256 timestamp, uint256 orderId)"
      ),
    ];

    const logs= await getLogs(
      lastBlock,
      currentBlock,
      perpMock.address,
      topics,
      hre.ethers.provider
    );

    // Parse retrieved events
    console.log(`Matched ${logs.logs.length} new events`);

    let newestTimeStamp = 0;
    for (const log of logs.logs) {
      const event = perpMock.interface.parseLog(log);
      const [timestamp, orderId] = event.args;

    }

    let olderThantimestamp = newestTimeStamp + 12;

  // Get Pyth price data
  const connection = new EvmPriceServiceConnection(
     "https://hermes.pyth.network",
 
  ); // See Price Service endpoints section below for other endpoints
  

    const priceIds = [
      priceFeed, // ETH/USD price id inmainet
    ];


    const check = (await connection.getLatestPriceFeeds(priceIds)) as any[];

   

   

      const priceUpdateData = await connection.getPriceFeedsUpdateData(
        priceIds
      );

    let userArgs = {
      "PerpMock": perpMock.address,
      "priceIds": [
        priceFeed
      ],
      "genesisBlock": genesisBlock
      };

    let storage = {
      };

      await perpMock
        .connect(gelatoMsgSenderSigner)
        .updatePriceOrders(priceUpdateData, [1, 2],check[0].price.publishTime);
      const order = await perpMock.getOrder(1);
      expect(order.publishTime).to.greaterThan(order.timestamp);
   

  })

  it("PerpMock.updatePrice: onlyGelatoMsgSender", async () => {
    // Arbitrary bytes array
     // Get Pyth price data
  const connection = new EvmPriceServiceConnection(
    "https://hermes.pyth.network",

 ); // See Price Service endpoints section below for other endpoints
    const priceIds = [
      priceFeed, // ETH/USD price id in mainnet
    ];
    const priceUpdateData = await connection.getPriceFeedsUpdateData(priceIds);
    await expect(perpMock.updatePriceOrders(priceUpdateData, [],1222)).to.be.revertedWith(
      "Only dedicated gelato msg.sender"
    );
  });




  it("PerpMock.updatePrice: should update price correctly", async () => {
    // Get Pyth price data
    const connection = new EvmPriceServiceConnection(
      "https://hermes.pyth.network",
  
   ); // See Price Service endpoints section below for other endpoints
    const priceIds = [
      priceFeed, // ETH/USD price id in mainnet
    ];

    const priceUpdateData = await connection.getPriceFeedsUpdateData(priceIds);

    // await perpMock
    //   .connect(gelatoMsgSenderSigner)
    //   .updatePrice(priceUpdateData);
    // expect(await perpMock.currentPrice()).to.not.eq(priceBefore);
  });
});
