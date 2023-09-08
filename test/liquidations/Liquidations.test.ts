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
import { priceFeedPyth, serverPyth } from "../constants";


const { ethers, deployments, w3f } = hre;

describe("PerpMock Liquidations contract tests", function () {
  let admin: Signer; // proxyAdmin
  let adminAddress: string;
  let perpMock: PerpMock;
  let gelatoMsgSenderSigner: Signer;
  let genesisBlock: number;
  let server = serverPyth;
  let priceFeed:string = priceFeedPyth
  let price:number;
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

    const connection = new EvmPriceServiceConnection(
      `https://xc-${server}.pyth.network`
    );

    const priceIds = [
      priceFeed, // ETH/USD price id inmainet
    ];

    const check = (await connection.getLatestPriceFeeds(priceIds)) as any[];
    price= +(check[0].price.price)


  });


  it("w3f create order", async () => { 
    await perpMock.marginTrade(10,20000,price)

    let userArgs = {
      "perpMock": perpMock.address,
      "priceIds": [priceFeed ],
      "genesisBlock": genesisBlock.toString(),
      "collateralThreshold":"50",
      server: serverPyth
      };

    let storage = {
      };
  
     let liquidationsW3f:Web3FunctionHardhat = w3f.get("liquidations");
     let  w3frun  = await liquidationsW3f.run({ userArgs, storage });

    let result = w3frun.result;
    expect (result.canExec).false
    expect( JSON.parse(w3frun.storage.storage.remainingOrders!).orders.length).eq(1)
    expect( JSON.parse(w3frun.storage.storage.remainingOrders!).orders[0].amount).eq(20000)
  
  
     
  })
  it("w3f create order and update it", async () => { 
    await perpMock.marginTrade(10,20000,price)
    await perpMock.updateCollateral(1,20000,true)
   
    
    let userArgs = {
      "perpMock": perpMock.address,
      "priceIds": [priceFeed ],
      "genesisBlock": genesisBlock.toString(),
      "collateralThreshold":"50",
      server: serverPyth
      };

    let storage = {
       };
  
     let liquidationsW3f:Web3FunctionHardhat = w3f.get("liquidations");
     let  w3frun  = await liquidationsW3f.run({ userArgs, storage });


    let result = w3frun.result;
    expect (result.canExec).false
    expect (JSON.parse(w3frun.storage.storage.remainingOrders!).orders.length).eq(1)
    expect (JSON.parse(w3frun.storage.storage.remainingOrders!).orders[0].amount).eq(40000) 
  })

  it("w3f create order and w3f run, no execution as current collateral >= 50% Threshold", async () => { 
    await perpMock.marginTrade(10,20000,price)
    await perpMock.updateCollateral(1,20000,true)

    let userArgs = {
      "perpMock": perpMock.address,
      "priceIds": [priceFeed ],
      "genesisBlock": genesisBlock.toString(),
      "collateralThreshold":"50",
      server: serverPyth
      };

    let storage = {
     // remainingOrders:  `{"orders":[{"timestamp":1693385398,"orderId":1},{"timestamp":1693385399,"orderId":2}]}`
      };
  
     let liquidationsW3f:Web3FunctionHardhat = w3f.get("liquidations");
     let  w3frun  = await liquidationsW3f.run({ userArgs, storage });
     let result = w3frun.result;
      
    /// First run


    await perpMock.updateCollateral(1,10000,false)


    /// Second run (web3 function when hardhat and second run price deviation 5% )
    storage = w3frun.storage.storage;

    
    w3frun  = await liquidationsW3f.run({ userArgs, storage });
    result = w3frun.result;

  
    expect (result.canExec).false
    expect (JSON.parse(w3frun.storage.storage.remainingOrders!).orders.length).eq(1)
    expect (JSON.parse(w3frun.storage.storage.remainingOrders!).orders[0].amount).eq(30000)
      
  })

  it("w3f create order and w3f run, execution as current collateral 49.9% < Threshold", async () => { 
    await perpMock.marginTrade(10,20000,price)
    await perpMock.updateCollateral(1,20000,true)

    let userArgs = {
      "perpMock": perpMock.address,
      "priceIds": [priceFeed ],
      "genesisBlock": genesisBlock.toString(),
      "collateralThreshold":"50",
      server: serverPyth
      };

    let storage = {
     // remainingOrders:  `{"orders":[{"timestamp":1693385398,"orderId":1},{"timestamp":1693385399,"orderId":2}]}`
      };
  
     let liquidationsW3f:Web3FunctionHardhat = w3f.get("liquidations");
     let  w3frun  = await liquidationsW3f.run({ userArgs, storage });
     let result = w3frun.result;
      
    /// First run


    await perpMock.updateCollateral(1,20100,false)


    /// Second run (web3 function when hardhat and second run price deviation 5% )
    storage = w3frun.storage.storage;

    w3frun  = await liquidationsW3f.run({ userArgs, storage });
    result = w3frun.result;

  
    expect (result.canExec).true
    expect (JSON.parse(w3frun.storage.storage.remainingOrders!).orders.length).eq(0)
  
    if (result.canExec) {
      
      await setBalance(perpMock.address, utils.parseEther("10000000000000"));
      const data = result.callData[0] as Web3FunctionResultCallData
      await gelatoMsgSenderSigner.sendTransaction({
        data: data.data,
        to:  data.to 
      })

    const trade = await perpMock.getMarginTrade(1)
    expect(trade.active).to.false

    }
     
  })

});
