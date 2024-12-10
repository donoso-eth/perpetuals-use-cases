/* eslint-disable @typescript-eslint/naming-convention */
import {
  Web3Function,
  Web3FunctionContext,
  Web3FunctionEventContext
} from "@gelatonetwork/web3-functions-sdk";
import { BigNumber, Contract, ethers, utils } from "ethers";

import { perpMockAbi } from "../abi/perpMockAbi";
import { requestDataPackages } from "@redstone-finance/sdk";
import { DataPackagesWrapper } from "@redstone-finance/evm-connector";

interface IPRICE {
  price: number;
  publishTime: number;
}

const parsePrice = (value: Uint8Array) => {
  const bigNumberPrice = ethers.BigNumber.from(value);
  return bigNumberPrice.toNumber() / 10 ** 8; // Redstone uses 8 decimals
}

Web3Function.onRun(async (context: Web3FunctionEventContext) => {
  const { userArgs, storage, multiChainProvider, log } = context;

  const provider = multiChainProvider.default();

  // userArgs
  const perpMock= (userArgs.perpMock as string) ?? "";
 
  const priceFeed = userArgs.priceFeed as string;
  if (priceFeed == undefined){
    return { canExec:false, message:"No price feed arg"}
  }
  const priceFeedAdapterAddress = userArgs.priceFeedAdapterAddress as string;

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


  // Craft transaction to update the price on-chain
  console.log(`Setting ${priceFeed} price in PriceFeed contract to: ${parsedPrice}, at ${ dataPackage.timestampMilliseconds}`);
  const { data } =
    await wrappedOracle.populateTransaction.updateDataFeedsValues(
      dataPackage.timestampMilliseconds
    );
 

  const perpMockContract = new Contract(perpMock, perpMockAbi, provider);
    const event = perpMockContract.interface.parseLog(log);
    const [timestamp, orderId] = event.args;
   
    const {data:mockData} =await  perpMockContract.populateTransaction.updatePriceOrders(orderId,dataPackage.timestampMilliseconds)


    let callData:any[] = []

    callData.push({ to: priceFeedAdapterAddress, data: data as string })

    callData.push({ to:perpMock, data: mockData as string })

    return {
      canExec: true,
      callData
    };
});
