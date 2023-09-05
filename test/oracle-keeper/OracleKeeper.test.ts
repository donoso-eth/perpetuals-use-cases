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
  Web3FunctionUserArgs,
  Web3FunctionResultV2,
  Web3FunctionResultCallData,
} from "@gelatonetwork/web3-functions-sdk";
import { Web3FunctionHardhat } from "@gelatonetwork/web3-functions-sdk/hardhat-plugin";
import { sleep } from "../../web3-functions/utils";

const { ethers, deployments, w3f } = hre;

describe("PerpMock set Orders contract tests", function () {
  let admin: Signer; // proxyAdmin
  let adminAddress: string;
  let perpMock: PerpMock;
  let gelatoMsgSenderSigner: Signer;
  let genesisBlock: number;
  beforeEach(async function () {
    if (hre.network.name !== "hardhat") {
      console.error("Test Suite is meant to be run on hardhat only");
      process.exit(1);
    }

    await deployments.fixture();

    [admin] = await ethers.getSigners();

    adminAddress = await admin.getAddress();
    await setBalance(adminAddress, ethers.utils.parseEther("1000"));
    const { gelatoMsgSender: gelatoMsgSender } = await hre.getNamedAccounts();
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

    const logs: Log[] = await getLogs(
      lastBlock,
      currentBlock,
      perpMock.address,
      topics,
      hre.ethers.provider
    );

    // Parse retrieved events
    console.log(`Matched ${logs.length} new events`);

    let newestTimeStamp = 0;
    for (const log of logs) {
      const event = perpMock.interface.parseLog(log);
      const [timestamp, orderId] = event.args;
  
      if (+timestamp.toString() > newestTimeStamp)
        newestTimeStamp = +timestamp.toString();
    }

    let olderThantimestamp = newestTimeStamp + 12;

    const connection = new EvmPriceServiceConnection(
      "https://xc-mainnet.pyth.network"
    );

    const priceIds = [
      "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace", // ETH/USD price id inmainet
    ];

    const check = (await connection.getLatestPriceFeeds(priceIds)) as any[];

    if (check[0].price.publishTime >= olderThantimestamp) {

      const priceUpdateData = await connection.getPriceFeedsUpdateData(
        priceIds
      );

    let userArgs = {
      "PerpMock": perpMock.address,
      "priceIds": [
        "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace"
      ],
      "genesisBlock": genesisBlock
      };

    let storage = {
      };
  
     let  lensGelatoW3f = w3f.get("lensChatGPT");
      let { result } = await lensGelatoW3f.run({ userArgs, storage });


      await perpMock
        .connect(gelatoMsgSenderSigner)
        .updatePriceOrders(priceUpdateData, [1, 2],check[0].price.publishTime);
      const order = await perpMock.getOrder(1);
      expect(order.publishTime).to.eq(check[0].price.publishTime);
    } else {
      console.log("not elapsed");
    }

  })
  it("w3f executes", async () => { 
      await perpMock.setOrder(2);
      await perpMock.setOrder(3);
  
      await sleep(10000);

    let userArgs = {
      "perpMock": perpMock.address,
      "priceIds": ["0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace"],
      "genesisBlock": genesisBlock.toString(),
      "delay":"12"
      };

    let storage = {
     // remainingOrders:  `{"orders":[{"timestamp":1693385398,"orderId":1},{"timestamp":1693385399,"orderId":2}]}`
      };
  
     let oracleKeeperW3f:Web3FunctionHardhat = w3f.get("oracle-keeper");
     let  w3frun  = await oracleKeeperW3f.run({ userArgs, storage });


    let result = w3frun.result;
    
    if (result.canExec) {

      await setBalance(perpMock.address, utils.parseEther("10000000000000"));
      const data = result.callData[0] as Web3FunctionResultCallData
      await gelatoMsgSenderSigner.sendTransaction({
        data: data.data,
        to:  data.to 
      })
    let order = await perpMock.getOrder(1);
  
    }


     
  })
  it("PerpMock.updatePrice: onlyGelatoMsgSender", async () => {
    // Arbitrary bytes array
    const connection = new EvmPriceServiceConnection(
      "https://xc-mainnet.pyth.network"
    );
    const priceIds = [
      "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace", // ETH/USD price id in mainnet
    ];
    const priceUpdateData = await connection.getPriceFeedsUpdateData(priceIds);
    await expect(perpMock.updatePriceOrders(priceUpdateData, [],1222)).to.be.revertedWith(
      "Only dedicated gelato msg.sender"
    );
  });

  it("PerpMock.pause: Pauses the contract", async () => {
    await perpMock.pause();

    expect(await perpMock.paused()).to.equal(true);
  });

  it("PerpMock.unpause: Unpauses the contract", async () => {
    await perpMock.pause();

    expect(await perpMock.paused()).to.equal(true);

    await perpMock.unpause();

    expect(await perpMock.paused()).to.equal(false);
  });

  it("PerpMock.updatePrice: should update price correctly", async () => {
    const connection = new EvmPriceServiceConnection(
      "https://xc-mainnet.pyth.network"
    );

    const priceIds = [
      "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace", // ETH/USD price id in mainnet
    ];

    const priceUpdateData = await connection.getPriceFeedsUpdateData(priceIds);

    // await perpMock
    //   .connect(gelatoMsgSenderSigner)
    //   .updatePrice(priceUpdateData);
    // expect(await perpMock.currentPrice()).to.not.eq(priceBefore);
  });
});
