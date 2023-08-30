import { task } from "hardhat/config";

export const verify = task("etherscan-verify", "verify").setAction(
  async ({}, hre) => {
    await hre.run("verify:verify", {
      address: "0x7c0d464B21552F3B8e0FDA2C74798e54CA0cAF7B",
      constructorArguments: [
        "0xcc53666e25bf52c7c5bc1e8f6e1f6bf58e871659",
        "0xff1a0f4744e8582DF1aE09D5611b887B6a12925C"
      ],
    });
  }
);
