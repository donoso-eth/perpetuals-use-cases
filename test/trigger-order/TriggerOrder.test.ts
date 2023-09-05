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


const { ethers, deployments, w3f } = hre;

describe("PerpMock Conditional contract tests", function () {
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

  it("w3f executes", async () => { 
    const connection = new EvmPriceServiceConnection(
      "https://xc-mainnet.pyth.network"
    );

    const priceIds = [
      "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace", // ETH/USD price id in testnet
    ];

    const check = (await connection.getLatestPriceFeeds(priceIds)) as any[];

    let price1 = Math.floor(check[0].price.price*0.95);
    let price2 = Math.floor(check[0].price.price*1.05);


    await perpMock.setConditionalOrder(100,price1,true)
    await perpMock.setConditionalOrder(200,price2,true)
    await perpMock.setConditionalOrder(300,price1,false)
    await perpMock.setConditionalOrder(400,price2,false)

    let userArgs = {
      "perpMock": perpMock.address,
      "priceIds": ["0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace"],
      "genesisBlock": genesisBlock.toString(),
      };

    let storage = {
     // remainingOrders:  `{"orders":[{"timestamp":1693385398,"orderId":1},{"timestamp":1693385399,"orderId":2}]}`
      };
  
     let oracleKeeperW3f:Web3FunctionHardhat = w3f.get("trigger-order");
     let  w3frun  = await oracleKeeperW3f.run({ userArgs, storage });
  

    let result = w3frun.result;
    
    if (result.canExec) {

      await setBalance(perpMock.address, utils.parseEther("10000000000000"));
      const data = result.callData[0] as Web3FunctionResultCallData
      await gelatoMsgSenderSigner.sendTransaction({
        data: data.data,
        to:  data.to 
      })
    let order1 = await perpMock.getConditionalOrder(1);
     expect (order1.publishTime).not.equal(0)
     let order2 = await perpMock.getConditionalOrder(2);
     expect (order2.publishTime).equal(0)
     let order3 = await perpMock.getConditionalOrder(3);
     expect (order3.publishTime).equal(0)
     let order4 = await perpMock.getConditionalOrder(4);
     expect (order4.publishTime).not.equal(0)
    }


     
  })
  it("PerpMock.updatePrice: onlyGelatoMsgSender", async () => {
    // Arbitrary bytes array
    const connection = new EvmPriceServiceConnection(
      "https://xc-mainnet.pyth.network"
    );
    const priceIds = [
      "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace", // ETH/USD price id in testnet
    ];

    const priceUpdateData = await connection.getPriceFeedsUpdateData(priceIds);
    await expect(perpMock.connect(admin).updatePriceConditionalOrders(priceUpdateData, [],123)).to.be.revertedWith(
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
      "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace", // ETH/USD price id in testnet
    ];


    const priceUpdateData = await connection.getPriceFeedsUpdateData(priceIds);

    // await perpMock
    //   .connect(gelatoMsgSenderSigner)
    //   .updatePrice(priceUpdateData);
    // expect(await perpMock.currentPrice()).to.not.eq(priceBefore);
  });
});
