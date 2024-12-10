import hre from "hardhat";
import { Signer } from "@ethersproject/abstract-signer";
import { requestDataPackages } from "@redstone-finance/sdk";
import { DataPackagesWrapper } from "@redstone-finance/evm-connector";

import { setBalance } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { RedstonePriceFeedWithRoundsBTC } from "../../typechain/contracts/RedstonePriceFeedWithRoundsBTC";
import { utils } from "ethers";

import { Log } from "@ethersproject/providers";
import { getLogs } from "../utils/getLogs";
import { PerpMock } from "../../typechain/contracts/PerpMock.sol";
const parsePrice = (value: Uint8Array) => {
  const bigNumberPrice = ethers.BigNumber.from(value);
  return bigNumberPrice.toNumber() / 10 ** 8; // Redstone uses 8 decimals
};

const { ethers, deployments, w3f } = hre;

describe("PerpMock set Orders contract tests", function () {
  let admin: Signer; // proxyAdmin
  let adminAddress: string;
  let perpMock: PerpMock;
  let priceFeedAdapter: RedstonePriceFeedWithRoundsBTC;
  let gelatoMsgSenderSigner: Signer;
  let genesisBlock: number;
  let priceFeed = "BTC";

  beforeEach(async function () {
    if (hre.network.name !== "hardhat") {
      console.error("Test Suite is meant to be run on hardhat only");
      process.exit(1);
    }

    await deployments.fixture();

    [admin] = await ethers.getSigners();

    adminAddress = await admin.getAddress();
    await setBalance(adminAddress, ethers.utils.parseEther("1000"));
    const { gelatoMsgSender } = await hre.getNamedAccounts();
    console.log("msgSender: " + gelatoMsgSender);
    gelatoMsgSenderSigner = await ethers.getSigner(gelatoMsgSender);

    perpMock = (await ethers.getContractAt(
      "PerpMock",
      (
        await deployments.get("PerpMock")
      ).address
    )) as PerpMock;

    priceFeedAdapter = (await ethers.getContractAt(
      "RedstonePriceFeedWithRoundsBTC",
      (
        await deployments.get("RedstonePriceFeedWithRoundsBTC")
      ).address
    )) as RedstonePriceFeedWithRoundsBTC;

    await setBalance(gelatoMsgSender, utils.parseEther("10000000000000"));
    genesisBlock = await hre.ethers.provider.getBlockNumber();
  });
  it("PerpMock.updatePrice: correct", async () => {
    await perpMock.setOrder(2);
    await perpMock.setOrder(3);

    let currentBlock = await hre.ethers.provider.getBlockNumber();
    let lastBlock = genesisBlock;

    const topics = [
      perpMock.interface.getEventTopic(
        "setOrderEvent(uint256 timestamp, uint256 orderId)"
      ),
    ];

    const logs = await getLogs(
      lastBlock,
      currentBlock,
      perpMock.address,
      topics,
      hre.ethers.provider
    );

    // Parse retrieved events
    console.log(`Matched ${logs.logs.length} new events`);

    let newestTimeStamp = 0;
    for (const log of logs.logs) {
      const event = perpMock.interface.parseLog(log);
      const [timestamp, orderId] = event.args;
    }

    let olderThantimestamp = newestTimeStamp + 12; // See Price Service endpoints section below for other endpoints

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

    const parsedPrice = parsePrice(dataPackage.dataPoints[0].value);

    console.log(
      `Setting ${priceFeed} price in PriceFeed contract to: ${parsedPrice}, at ${dataPackage.timestampMilliseconds}`
    );

    let userArgs = {
      PerpMock: perpMock.address,
      priceIds: [priceFeed],
      genesisBlock: genesisBlock,
    };

    let storage = {};

    const { data } =
      await wrappedOracle.populateTransaction.updateDataFeedsValues(
        dataPackage.timestampMilliseconds
      );

    let tx = await gelatoMsgSenderSigner.sendTransaction({
      to: priceFeedAdapter.address,
      data,
    });

    await tx.wait();

    let data2 = await priceFeedAdapter.latestRoundData();
    console.log(data2);

    const { data: data3 } =
      await perpMock.populateTransaction.updatePriceOrders(
        1,
        dataPackage.timestampMilliseconds
      );

    let tx2 = await gelatoMsgSenderSigner.sendTransaction({
      to: perpMock.address,
      data: data3,
    });

    await tx2.wait();

    let order1 = await perpMock.getOrder(1);
    console.log(order1)


  });
});
