/* eslint-disable @typescript-eslint/naming-convention */
import {
  Web3Function,
  Web3FunctionContext,
} from "@gelatonetwork/web3-functions-sdk";
import { Contract, ethers } from "ethers";


import { getLogs } from "../../test/utils/getLogs";
import { perpMockAbi } from "../abi/perpMockAbi";
import { requestDataPackages } from "@redstone-finance/sdk";
import { DataPackagesWrapper } from "@redstone-finance/evm-connector";

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

const parsePrice = (value: Uint8Array) => {
  const bigNumberPrice = ethers.BigNumber.from(value);
  return bigNumberPrice.toNumber() / 10 ** 8; // Redstone uses 8 decimals
};

Web3Function.onRun(async (context: Web3FunctionContext) => {
  const { userArgs, storage, multiChainProvider } = context;

  const provider = multiChainProvider.default();
  const network = await provider.getNetwork();
  const chainId = network.chainId;

  // userArgs
  const perpMock = (userArgs.perpMock as string) ?? "";
  const priceFeed = userArgs.priceFeed as string;

  if (priceFeed == undefined) {
    return { canExec: false, message: "No price feed arg" };
  }
  const priceFeedAdapterAddress = userArgs.priceFeedAdapterAddress as string;
  const genesisBlock = +(userArgs.genesisBlock ?? ("0" as string));
  const collateralThreshold = +(
    userArgs.collateralThreshold ?? ("50" as string)
  );

  // User Storage
  const lastProcessedBlock = +(
    (await storage.get("lastProcessedBlock")) ?? genesisBlock
  );
  console.log("lastProces: ", await storage.get("lastProcessedBlock"));

  const remainingOrders: { orders: Array<IORDER> } = JSON.parse(
    (await storage.get("remainingOrders")) ?? `{"orders":[]}`
  );

  const perpMockContract = new Contract(perpMock, perpMockAbi, provider);

  const marginTradeTopic = await perpMockContract.filters.marginTradeEvent()
    .topics;
  const updateCollateralTopic =
    await perpMockContract.filters.updateCollateralEvent().topics;

  // Get Pyth price data

  const currentBlock = await provider.getBlockNumber();

  let abi = [
    "function updateDataFeedsValues(uint256) external",
    "function getDataServiceId() public pure  override returns (string memory)",
    "function getUniqueSignersThreshold() public pure returns (uint8)",
    "function latestRoundData() external view returns (uint80,int256,uint256,int256,uint80)",
    "function decimals() external view returns (uint8)",
  ];
  const priceFeedAdapter = new Contract(priceFeedAdapterAddress, abi, provider);

  const latestSignedPrice = await requestDataPackages({
    dataServiceId: "redstone-primary-prod",
    uniqueSignersCount: 2,
    dataFeeds: [priceFeed],
    urls: ["https://oracle-gateway-1.a.redstone.vip"],
  });

  const dataPackagesWrapper = new DataPackagesWrapper(latestSignedPrice);
  const wrappedOracle =
    dataPackagesWrapper.overwriteEthersContract(priceFeedAdapter);
  // Retrieve stored & live prices

  const { dataPackage } = latestSignedPrice[priceFeed]![0];

  const lastTimestampPackage =
    (await storage.get("lastTimestampPackage")) ?? "0";

  const parsedPrice = parsePrice(dataPackage.dataPoints[0].value);

  let price: IPRICE = {
    price: +Math.floor(parsedPrice*10**8),
    publishTime:    dataPackage.timestampMilliseconds,
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
      tokens: +tokens.toString() / 10 ** 4,
    });
  }
  console.log(
    "New Orders: ",
    orders.map((order) => order.orderId)
  );
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

    if (remainingOrders.orders.length >= 1 && chainId == 31337) {
      deviation = order.price * 0.05;
    }

    let collateralRequired =
      order.tokens * (deviation / 10 ** 8) * order.leverage;
    const actualCollateralThreshold =
      ((order.amount - collateralRequired) /
        (order.tokens * (order.price / 10 ** 8))) *
      100;
    console.log("Actual Threshold: ", actualCollateralThreshold.toFixed(2));
    if (actualCollateralThreshold < collateralThreshold) {
      ordersToLiquidate.push(order.orderId);
    }
  }

  let ordersRemaining: Array<IORDER> = (orders = orders.filter(
    (order) => !ordersToLiquidate.includes(order.orderId)
  ));

  // update storage moving forward
  await storage.set("lastProcessedBlock", logs.toBlock.toString());
  await storage.set(
    "remainingOrders",
    JSON.stringify({ orders: ordersRemaining })
  );

  // Preparing tx
  if (ordersToLiquidate.length > 0) {
    console.log("Liquidating Orders:", ordersToLiquidate);
    console.log("Remaining NrOrders:", ordersRemaining.length);
    const callData = perpMockContract.interface.encodeFunctionData(
      "liquidate",
      [ordersToLiquidate, price.publishTime, price.price]
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
    console.log("Remaining NrOrders:", ordersRemaining.length);
    return {
      canExec: false,
      message: "Not orders to Liquidate",
    };
  }
});
