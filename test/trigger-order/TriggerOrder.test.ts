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
import { requestDataPackages } from "@redstone-finance/sdk";
import { DataPackagesWrapper } from "@redstone-finance/evm-connector";

import { Web3FunctionHardhat } from "@gelatonetwork/web3-functions-sdk/hardhat-plugin";
import { RedstonePriceFeedWithRoundsBTC } from "../../typechain/contracts/RedstonePriceFeedWithRoundsBTC";



const { ethers, deployments, w3f } = hre;
const parsePrice = (value: Uint8Array) => {
  const bigNumberPrice = ethers.BigNumber.from(value);
  return bigNumberPrice.toNumber() / 10 ** 8; // Redstone uses 8 decimals
}

describe("PerpMock Conditional contract tests", function () {
  let admin: Signer; // proxyAdmin
  let adminAddress: string;
  let perpMock: PerpMock;
  let  priceFeedAdapter : RedstonePriceFeedWithRoundsBTC;
  let priceFeed = "BTC";
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

    priceFeedAdapter  = (await ethers.getContractAt(
      "RedstonePriceFeedWithRoundsBTC",
      (
        await deployments.get("RedstonePriceFeedWithRoundsBTC")
      ).address
    )) as RedstonePriceFeedWithRoundsBTC;


    await setBalance(perpMock.address, utils.parseEther("10000000000000"));
    await setBalance(gelatoMsgSender, utils.parseEther("10000000000000"));
    genesisBlock = await hre.ethers.provider.getBlockNumber();

  

  });

  it("w3f executes", async () => { 
    // Get Pyth price data
 

  const latestSignedPrice = await requestDataPackages({
    dataServiceId: "redstone-primary-prod",
    uniqueSignersCount: 2,
     dataFeeds: [priceFeed],
    urls: ["https://oracle-gateway-1.a.redstone.vip"],
  });


  const dataPackagesWrapper = new DataPackagesWrapper(
    latestSignedPrice
  );
  const wrappedOracle = dataPackagesWrapper.overwriteEthersContract(priceFeedAdapter);
  // Retrieve stored & live prices

  const { dataPackage } = latestSignedPrice[priceFeed]![0];

  const parsedPrice = parsePrice(dataPackage.dataPoints[0].value);

    let price1 = Math.floor(parsedPrice*10**8*0.95);
    let price2 = Math.floor(parsedPrice*10**8*1.05);
    console.log(price1,price2)

    await perpMock.setConditionalOrder(100,price1,true)
    await perpMock.setConditionalOrder(200,price2,true)
    await perpMock.setConditionalOrder(300,price1,false)
    await perpMock.setConditionalOrder(400,price2,false)

    let userArgs = {
      "perpMock": perpMock.address,
      "priceFeed":priceFeed,
      "priceFeedAdapterAddress": priceFeedAdapter.address,
      "genesisBlock": genesisBlock.toString(),

      };

    let storage = {
     // remainingOrders:  `{"orders":[{"timestamp":1693385398,"orderId":1},{"timestamp":1693385399,"orderId":2}]}`
      };
  
     let oracleKeeperW3f:Web3FunctionHardhat = w3f.get("trigger-order");
     let  w3frun  = await oracleKeeperW3f.run("onRun",{ userArgs, storage });
  

    let result = w3frun.result;
    
    if (result.canExec) {

      await setBalance(perpMock.address, utils.parseEther("10000000000000"));
      const priceData = result.callData[0] as Web3FunctionResultCallData
      const updateOrderData = result.callData[1] as Web3FunctionResultCallData
      await gelatoMsgSenderSigner.sendTransaction({
        data: priceData.data,
        to:  priceData.to 
      })

      await gelatoMsgSenderSigner.sendTransaction({
        data: updateOrderData .data,
        to: updateOrderData.to 
      })


    let order1 = await perpMock.getConditionalOrder(1);
      console.log(order1)
     expect (+order1.publishTime.toString()).not.equal(0)
     let order2 = await perpMock.getConditionalOrder(2);
     expect (+order2.publishTime.toString()).equal(0)
     let order3 = await perpMock.getConditionalOrder(3);
     expect (+order3.publishTime.toString()).equal(0)
     let order4 = await perpMock.getConditionalOrder(4);
     expect (+order4.publishTime.toString()).not.equal(0)
    }


     
  })
  it("PerpMock.updatePrice: onlyGelatoMsgSender", async () => {

  
  // await expect(perpMock.connect(admin).updatePriceConditionalOrders(priceUpdateData, [],123)).to.be.revertedWith(
  //     "Only dedicated gelato msg.sender"
  //   );
  });

 

  it("PerpMock.updatePrice: should update price correctly", async () => {
    // Get Pyth price data
  //   const connection = new EvmPriceServiceConnection(
  //     "https://hermes.pyth.network",
  
  //  ); // See Price Service endpoints section below for other endpoints
  //   const priceIds = [
  //     priceFeed // ETH/USD price id in testnet
  //   ];


  //   const priceUpdateData = await connection.getPriceFeedsUpdateData(priceIds);

    // await perpMock
    //   .connect(gelatoMsgSenderSigner)
    //   .updatePrice(priceUpdateData);
    // expect(await perpMock.currentPrice()).to.not.eq(priceBefore);
  });
});
