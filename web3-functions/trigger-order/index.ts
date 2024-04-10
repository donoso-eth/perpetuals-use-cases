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
interface IORDER {
  timestamp: number;
  orderId: number;
  price: number;
  above: boolean;
}

Web3Function.onRun(async (context: Web3FunctionContext) => {
  const { userArgs, storage, secrets, multiChainProvider } = context;

  const provider = multiChainProvider.default();

  // userArgs
  const perpMock = (userArgs.perpMock as string) ?? "";
  const priceIds = (userArgs.priceIds ?? "") as string[];
  const genesisBlock = +(userArgs.genesisBlock ?? ("0" as string));
  // User Storage
  const lastProcessedBlock = +(
    (await storage.get("lastProcessedBlock")) ?? genesisBlock
  );

  const ordersToFullfill: { orders: Array<IORDER> } = JSON.parse(
    (await storage.get("ordersToFullfill")) ?? `{"orders":[]}`
  );

  const perpMockContract = new Contract(perpMock, perpMockAbi, provider);



  // Get Pyth price data
  const connection = new EvmPriceServiceConnection(
    "https://hermes.pyth.network",
  ); // See Price Service endpoints section below for other endpoints


  const check = (await connection.getLatestPriceFeeds(priceIds)) as PriceFeed[];



  const priceObject = check[0].toJson().price;

  if (
    check.length == 0 ||
    priceObject == undefined ||
    priceObject.price == undefined
  ) {
    return { canExec: false, message: "No price available" };
  }

  let price: IPRICE = {
    price: +priceObject.price,
    publishTime: priceObject.publish_time,
  };

  let orders: Array<IORDER> = [];

  // Get events from emitted by the contract
  const topics = [
    perpMockContract.interface.getEventTopic(
      "setConditionalOrderEvent(uint256,uint256,int64,bool)"
    ),
  ];

  const currentBlock = await provider.getBlockNumber();
  let logs = await getLogs(
    lastProcessedBlock,
    currentBlock,
    perpMock,
    topics,
    provider
  );

  for (const log of logs.logs) {
    const event = perpMockContract.interface.parseLog(log);
    const [timestamp, orderId, price, above] = event.args;
    orders.push({
      timestamp: +timestamp.toString(),
      orderId: +orderId.toString(),
      price: + price.toString(),
      above,
    });
  }

  // add the stored orders not executed from previoius blocks
  orders = orders.concat(ordersToFullfill.orders);


  // Matching orders
  console.log('orders: ', orders.length)
  let ordersAbove: Array<IORDER> = orders.filter(
    (fil) => fil.above && price.price >= fil.price
  );

  let ordersBelow: Array<IORDER> = orders.filter(
    (fil) => !fil.above && price.price <= fil.price
  );


  let ordersReady: number[] = (ordersAbove
    .concat(ordersBelow))
    .map((order) => order.orderId);

    console.log('ready: ' +  ordersReady)

  ordersToFullfill.orders = orders.filter(
    (order) => !ordersReady.includes(order.orderId)
  );

  // update storage moving forward
  await storage.set("lastProcessedBlock", logs.toBlock.toString());
  await storage.set("ordersToFullfill", JSON.stringify(ordersToFullfill));
  console.log(`orders remaining: `, ordersToFullfill.orders.length)

  // web3 tx preparation
  if (ordersReady.length > 0) {
    const updatePriceData = await connection.getPriceFeedsUpdateData(priceIds);
    const callData = perpMockContract.interface.encodeFunctionData(
      "updatePriceConditionalOrders",
      [updatePriceData, ordersReady, price.publishTime]
    );
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
    if (ordersToFullfill.orders.length > 1) {
      console.log(` orders remaining: ${ordersToFullfill.orders.length}`);
    }
    return {
      canExec: false,
      message: "Not orders to settle",
    };
  }
});
