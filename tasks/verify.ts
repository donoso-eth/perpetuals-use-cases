import { task } from "hardhat/config";

export const verify = task("etherscan-verify", "verify").setAction(
  async ({}, hre) => {
    await hre.run("verify:verify", {
      address: "0x17E2b1AED9CA9A5E63ff7b4736cE7657b28EB8f8",
      constructorArguments: [
        "0xbb97656cd5fece3a643335d03c8919d5e7dcd225",
        "0xff1a0f4744e8582DF1aE09D5611b887B6a12925C"
      ],
    });
  }
);
