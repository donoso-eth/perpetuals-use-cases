import hre, { deployments, getNamedAccounts } from "hardhat";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { sleep } from "../web3-functions/utils";

const isHardhat = hre.network.name === "hardhat";

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deploy } = deployments;

  const { deployer, gelatoMsgSender, pyth } = await getNamedAccounts();

  if (!isHardhat) {
    console.log(
      `Deploying PerpMock to ${hre.network.name}. Hit ctrl + c to abort`
    );
  }

  const priceFeed = "BTC";

  // let arifact = `RedstonePriceFeedWithRoundsBTC`;
  // const adapterETH = await deploy(arifact, {
  //   from: deployer,
  //   log: hre.network.name !== "hardhat",
  //   // proxy: {
  //   //   proxyContract: "EIP173Proxy",
  //   // },
  // });
 // console.log(`Deployed Price Feed ${priceFeed} to ${adapterETH.address}`);
  console.log('MsgSender: ' + gelatoMsgSender)
  const perp = await deploy("PerpMock", {
    from: deployer,
    args: [
      "0xbb97656cd5fece3a643335d03c8919d5e7dcd225",
      "0x5B91C8E7a2DEABC623E6Ab34E8c26F27Cc18bC66",
     // adapterETH.address,
      "0xd8253782c45a12053594b9deB72d8e8aB2Fca54c",
    ],
    log: true,
  });

  console.log("contract deployed on: " + perp.address);
};

func.skip = async () => {
  return false;
};
func.tags = ["PerpMock"];

export default func;
