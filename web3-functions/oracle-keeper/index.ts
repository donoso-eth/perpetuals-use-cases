/* eslint-disable @typescript-eslint/naming-convention */
import {
  Web3Function,
  Web3FunctionContext,
} from "@gelatonetwork/web3-functions-sdk";
import { BigNumber, Contract, utils } from "ethers";

import { EvmPriceServiceConnection, PriceFeed } from "@pythnetwork/pyth-evm-js";
import { getLogs } from "../../test/utils/getLogs";
import { perMockAbi } from "../../test/oracle-keeper/perpMockAbi";


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


  // User Storage
  const lastProcessedBlock = +((await storage.get("lastProcessedBlock")) ?? genesisBlock);


  const remainingOrders:{orders:Array<{timestamp: number, orderId:number}>} =   JSON.parse(
    (await storage.get("remainingOrders")) ?? `{"orders":[]}`
  );
  console.log(remainingOrders.orders);

 const perpMockContract = new Contract(perpMock, perMockAbi, provider);

  // Get Pyth price data
  const connection = new EvmPriceServiceConnection(
    "https://xc-testnet.pyth.network"
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
    price:+priceObject.price,
    publishTime: priceObject.publish_time
  } 

  let orders:Array<{timestamp: number, orderId:number}> = [];

  for (const log of logs){
    const event = perpMockContract.interface.parseLog(log);
    const [timestamp, orderId] = event.args;
    orders.push({timestamp:+timestamp.toString(), orderId:+orderId.toString()})
  }

 orders  = orders.concat(remainingOrders.orders)
 let ordersReady:number[] = [];
 let ordersTooEarly:Array<{timestamp: number, orderId:number}> = [];

  for (const order of orders) {
    if (order.timestamp + delay <= +price.publishTime.toString()){
      ordersReady.push(+order.orderId.toString());  
  } else {
    ordersTooEarly.push({timestamp:order.timestamp, orderId:order.orderId})
  }
  }
  

  // update storage moving forward
  await storage.set("lastProcessedBlock", currentBlock.toString());
  await storage.set("remainingOrders", JSON.stringify({orders: ordersTooEarly}));

  // web3 funciton storage initialization
  if (ordersReady.length>0) {
  
    const updatePriceData = await connection.getPriceFeedsUpdateData(priceIds);

    console.log("Web3 Function price initialization");

    const callData = perpMockContract.interface.encodeFunctionData("updatePrice", [updatePriceData,ordersReady]);
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
    return {
      canExec:false,
      message: "Not orders to settle"
    }
  }


});
