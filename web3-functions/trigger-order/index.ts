/* eslint-disable @typescript-eslint/naming-convention */
import {
  Web3Function,
  Web3FunctionContext,
} from "@gelatonetwork/web3-functions-sdk";
import { BigNumber, Contract, ethers, utils } from "ethers";
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
  above: boolean;
}

const parsePrice = (value: Uint8Array) => {
  const bigNumberPrice = ethers.BigNumber.from(value);
  return bigNumberPrice.toNumber() / 10 ** 8; // Redstone uses 8 decimals
}

Web3Function.onRun(async (context: Web3FunctionContext) => {
  const { userArgs, storage, secrets, multiChainProvider } = context;

  const provider = multiChainProvider.default();

  // userArgs
  const perpMock = (userArgs.perpMock as string) ?? "";
  const priceFeed = userArgs.priceFeed as string;
  if (priceFeed == undefined){
    return { canExec:false, message:"No price feed arg"}
  }
  const priceFeedAdapterAddress = userArgs.priceFeedAdapterAddress as string;
  const genesisBlock = +(userArgs.genesisBlock ?? ("0" as string));
  // User Storage
  const lastProcessedBlock = +(
    (await storage.get("lastProcessedBlock")) ?? genesisBlock
  );

  const ordersToFullfill: { orders: Array<IORDER> } = JSON.parse(
    (await storage.get("ordersToFullfill")) ?? `{"orders":[]}`
  );

  const perpMockContract = new Contract(perpMock, perpMockAbi, provider);


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

  const dataPackagesWrapper = new DataPackagesWrapper(
    latestSignedPrice
  );
  const wrappedOracle = dataPackagesWrapper.overwriteEthersContract(priceFeedAdapter);
  // Retrieve stored & live prices

  const { dataPackage } = latestSignedPrice[priceFeed]![0];

  const lastTimestampPackage = await storage.get("lastTimestampPackage") ?? "0"

  const parsedPrice = parsePrice(dataPackage.dataPoints[0].value);

 
  let price: IPRICE = {
    price: +Math.floor(parsedPrice*10**8),
    publishTime:    dataPackage.timestampMilliseconds,
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
    const { data:priceData } =
    await wrappedOracle.populateTransaction.updateDataFeedsValues(
      dataPackage.timestampMilliseconds
    );
    const callData = perpMockContract.interface.encodeFunctionData(
      "updatePriceConditionalOrders",
      [ordersReady, price.publishTime]
    );
    return {
      canExec: true,
      callData: [
        {
          to: priceFeedAdapterAddress,
          data:priceData!
        },
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

