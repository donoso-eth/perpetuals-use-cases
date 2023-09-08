import { task } from "hardhat/config";

export const verify = task("etherscan-verify", "verify").setAction(
  async ({}, hre) => {
    await hre.run("verify:verify", {
      address: "0x0542F269C737bDe9e2d1883FaF0eC2F3D51e5B95",
      constructorArguments: [
        "0xbb97656cd5fece3a643335d03c8919d5e7dcd225",
        "0xff1a0f4744e8582DF1aE09D5611b887B6a12925C",
        "0x5B91C8E7a2DEABC623E6Ab34E8c26F27Cc18bC66"
      ],
    });
  }
);
