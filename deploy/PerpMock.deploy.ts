import hre from "hardhat";
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


    const perp = await deploy("PerpMock", {
      from: deployer,
      args: [
        gelatoMsgSender,
        pyth,
        "0xd8253782c45a12053594b9deB72d8e8aB2Fca54c"
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
