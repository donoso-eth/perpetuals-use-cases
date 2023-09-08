/* eslint-disable @typescript-eslint/naming-convention */
import {
  Web3Function,
  Web3FunctionContext,
} from "@gelatonetwork/web3-functions-sdk";
import { Contract} from "ethers";

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
  amount: number;
  leverage: number;
  tokens: number;
}

Web3Function.onRun(async (context: Web3FunctionContext) => {
  const { userArgs, storage,  multiChainProvider } = context;

  const provider = multiChainProvider.default();
  const network = await provider.getNetwork();
  const chainId = network.chainId;
 
  // userArgs
  const perpMock = (userArgs.perpMock as string) ?? "";
  const priceIds = (userArgs.priceIds ?? "") as string[];
  const genesisBlock = +(userArgs.genesisBlock ?? ("0" as string));
  const collateralThreshold = +(
    userArgs.collateralThreshold ?? ("50" as string)
  );
  const server= userArgs.server as string ?? "mainnet";
  
    console.log('lastProces: ' , await storage.get("lastProcessedBlock"))
  // User Storage
  const lastProcessedBlock = +(
    (await storage.get("lastProcessedBlock")) ?? genesisBlock
  );


  const remainingOrders: { orders: Array<IORDER> } = JSON.parse(
    (await storage.get("remainingOrders")) ?? `{"orders":[]}`
  );

  const perpMockContract = new Contract(perpMock, perpMockAbi, provider);

  const marginTradeTopic = await perpMockContract.filters.marginTradeEvent()
    .topics;
  const updateCollateralTopic =
    await perpMockContract.filters.updateCollateralEvent().topics;

  // Get Pyth price data
  const connection = new EvmPriceServiceConnection(
    `https://xc-${server}.pyth.network`
  );
  const currentBlock = await provider.getBlockNumber();

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
    price: +priceObject.price.toString(),
    publishTime: +priceObject.publish_time.toString(),
  };

  let orders: Array<IORDER> = [];

  // Query new Trades
  let logs = await getLogs(
    lastProcessedBlock,
    currentBlock,
    perpMock,
    marginTradeTopic,
    provider
  );


  for (const log of logs.logs) {
    const event = perpMockContract.interface.parseLog(log);
    const [timestamp, orderId, amount, leverage, price, tokens] = event.args;

    orders.push({
      timestamp: +timestamp.toString(),
      orderId: +orderId.toString(),
      price: +price.toString(),
      amount: +amount.toString(),
      leverage: +leverage.toString(),
      tokens: +tokens.toString()/10**4,
    });
  }


  console.log('New Orders: ', orders.map(order=> order.orderId));

  orders = orders.concat(remainingOrders.orders);
  
  // Update Collateral
  logs = await getLogs(
    lastProcessedBlock,
    currentBlock,
    perpMock,
    updateCollateralTopic,
    provider
  );

  for (const log of logs.logs) {

    const event = perpMockContract.interface.parseLog(log);
    const [orderId, amount, add] = event.args;
    let availableOrder = orders.filter(
      (order) => order.orderId == +orderId.toString()
    );
    if (availableOrder.length == 1) {
      if (add) {
        availableOrder[0].amount += +amount.toString();
      } else {
        availableOrder[0].amount -= +amount.toString();
      }
    }
  }

  let ordersToLiquidate: number[] = [];
  for (const order of orders) {
    let deviation = order.price - price.price;

    if (remainingOrders.orders.length >= 1 && chainId == 31337){
      deviation = order.price * 0.05;
    }
   
      let collateralRequired = order.tokens * (deviation/10**8) * order.leverage;
      const actualCollateralThreshold =
        ((order.amount - collateralRequired) / (order.tokens* (order.price/10**8))) * 100;
      console.log('Actual Threshold: ', actualCollateralThreshold.toFixed(2));
      if (actualCollateralThreshold < collateralThreshold) {
        ordersToLiquidate.push(order.orderId);
      }
    
  }



  let ordersRemaining: Array<IORDER> =  orders = orders.filter(
    (order) => !ordersToLiquidate.includes(order.orderId)
  );

  // update storage moving forward
  await storage.set("lastProcessedBlock", logs.toBlock.toString());
  await storage.set(
    "remainingOrders",
    JSON.stringify({ orders: ordersRemaining })
  );

  // web3 funciton storage initialization
  if (ordersToLiquidate.length > 0) {
    console.log('Liquidating Orders:', ordersToLiquidate);
    console.log('Remaining NrOrders:', ordersRemaining.length)
     const callData = perpMockContract.interface.encodeFunctionData(
      "liquidate",
      [ ordersToLiquidate, price.publishTime, price.price]
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
    console.log('Remaining NrOrders:', ordersRemaining.length)
    return {
      canExec: false,
      message: "Not orders to Liquidate",
    };
  }
});
