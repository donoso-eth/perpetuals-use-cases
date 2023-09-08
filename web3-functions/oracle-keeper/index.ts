/* eslint-disable @typescript-eslint/naming-convention */
import {
  Web3Function,
  Web3FunctionContext,
} from "@gelatonetwork/web3-functions-sdk";
import { BigNumber, Contract, utils } from "ethers";

import { EvmPriceServiceConnection, PriceFeed } from "@pythnetwork/pyth-evm-js";
import { getLogs } from "../../test/utils/getLogs";
import { perpMockAbi } from "../abi/perpMockAbi";


interface IPRICE {
  price: number;
  publishTime: number;
}

Web3Function.onRun(async (context: Web3FunctionContext) => {
  const { userArgs, storage, secrets, multiChainProvider } = context;

  const provider = multiChainProvider.default();

  // userArgs
  const perpMock= (userArgs.perpMock as string) ?? "";
  const priceIds = (userArgs.priceIds ?? "") as string[];
  const genesisBlock = +(userArgs.genesisBlock ?? ("0" as string));  
  const delay= +((userArgs.delay as string) ?? "12");
  const server= userArgs.server as string ?? "mainnet";

  // User Storage
  const lastProcessedBlock = +((await storage.get("lastProcessedBlock")) ?? genesisBlock);


  const remainingOrders:{orders:Array<{timestamp: number, orderId:number}>} =   JSON.parse(
    (await storage.get("remainingOrders")) ?? `{"orders":[]}`
  );

 const perpMockContract = new Contract(perpMock, perpMockAbi, provider);

  // Get Pyth price data
  const connection = new EvmPriceServiceConnection(
    `https://xc-${server}.pyth.network`
  ); // See Price Service endpoints section below for other endpoints

  const topics = [
    perpMockContract.interface.getEventTopic(
      "setOrderEvent(uint256 timestamp, uint256 orderId)"
    ),
  ];

  const currentBlock = await provider.getBlockNumber();
  let logs = await getLogs(lastProcessedBlock, currentBlock,perpMock,topics,provider );
 
  const check = (await connection.getLatestPriceFeeds(priceIds)) as PriceFeed[];

  const priceObject = check[0].toJson().price;


  if (
    check.length == 0 ||
    priceObject == undefined ||
    priceObject.price == undefined
  ) {
    return { canExec: false, message: "No price available" };
  }

  let price:IPRICE = {
    price:+priceObject.price.toString(),
    publishTime: +priceObject.publish_time.toString()
  } 

  let orders:Array<{timestamp: number, orderId:number}> = [];

  for (const log of logs.logs){
    const event = perpMockContract.interface.parseLog(log);
    const [timestamp, orderId] = event.args;
    orders.push({timestamp:+timestamp.toString(), orderId:+orderId.toString()})
  }

 orders  = orders.concat(remainingOrders.orders)
 let ordersReady:number[] = [];
 let ordersTooEarly:Array<{timestamp: number, orderId:number}> = [];

  for (const order of orders) {
    console.log(order.timestamp + delay,price.publishTime, order.orderId)
    if (order.timestamp + delay <= price.publishTime){
      ordersReady.push(order.orderId);  
  } else {
    ordersTooEarly.push({timestamp:order.timestamp, orderId:order.orderId})
  }
  }
  

  // update storage moving forward
  await storage.set("lastProcessedBlock", logs.toBlock.toString());
  await storage.set("remainingOrders", JSON.stringify({orders: ordersTooEarly}));

  // web3 funciton storage initialization
  if (ordersReady.length>0) {
  
    const updatePriceData = await connection.getPriceFeedsUpdateData(priceIds);

    const callData = perpMockContract.interface.encodeFunctionData("updatePriceOrders", [updatePriceData,ordersReady,price.publishTime],);
    return {
      canExec: true,
      callData: [
        {
          to: perpMock,
          data: callData,
        },
      ],
    };
  } else {
    if (ordersTooEarly.length > 1){
      console.log(` orders too early: ${ordersTooEarly.length}`)
    }
    return {
      canExec:false,
      message: "Not orders to settle"
    }
  }


});
