/* eslint-disable @typescript-eslint/naming-convention */
import {
  Web3Function,
  Web3FunctionContext,
  Web3FunctionEventContext
} from "@gelatonetwork/web3-functions-sdk";
import { BigNumber, Contract, utils } from "ethers";

import { EvmPriceServiceConnection, PriceFeed } from "@pythnetwork/pyth-evm-js";
import { getLogs } from "../../test/utils/getLogs";
import { perpMockAbi } from "../abi/perpMockAbi";


interface IPRICE {
  price: number;
  publishTime: number;
}

Web3Function.onRun(async (context: Web3FunctionEventContext) => {
  const { userArgs, storage, multiChainProvider, log } = context;

  const provider = multiChainProvider.default();

  // userArgs
  const perpMock= (userArgs.perpMock as string) ?? "";
  const priceIds = (userArgs.priceIds ?? "") as string[];
 


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

  let price:IPRICE = {
    price:+priceObject.price.toString(),
    publishTime: +priceObject.publish_time.toString()
  } 



  const perpMockContract = new Contract(perpMock, perpMockAbi, provider);
    const event = perpMockContract.interface.parseLog(log);
    const [timestamp, orderId] = event.args;
   
 

  // Preparing data
    const updatePriceData = await connection.getPriceFeedsUpdateData(priceIds);

    const callData = perpMockContract.interface.encodeFunctionData("updatePriceOrders", 
    [updatePriceData,[orderId],price.publishTime],);
    return {
      canExec: true,
      callData: [
        {
          to: perpMock,
          data: callData,
        },
      ],
    };
});
