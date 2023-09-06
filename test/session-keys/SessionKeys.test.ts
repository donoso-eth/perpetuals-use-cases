
import { deployments, ethers } from "hardhat";
import {SessionKeyGate} from '../../typechain/contracts/sessionKeyGateForwarder' 
import { expect } from "chai";
import { v4 as uuidv4 } from "uuid";
import {
  setBalance,
} from "@nomicfoundation/hardhat-network-helpers";
import { fastForwardTime } from "../utils";
import { TempKey } from "../utils/tempKey";
import { PerpMock } from "../../typechain/contracts/PerpMock";


describe("Session Keys ", () => {
  let sessionKey: SessionKeyGate;
  let perpMock: PerpMock;

  let GelatoRelay = "0xd8253782c45a12053594b9deB72d8e8aB2Fca54c";
  before(async () => {
    await deployments.fixture();

    perpMock = (await ethers.getContractAt(
      "PerpMock",
      (
        await deployments.get("PerpMock")
      ).address
    )) as PerpMock;


    const { address: sessionKeyAddress } = await deployments.get(
      "SessionKeyGate"
    );

    sessionKey = (await ethers.getContractAt(
      "SessionKeyGate",
      sessionKeyAddress
    )) as SessionKeyGate;

  

  });

  it("settle Order", async () => {
    const [deployer] = await ethers.getSigners();

    /// creation of a tempKey and Session ID
    const tempKey = new TempKey();
    const tempAddress = tempKey.address;
    const sessionId = uuidv4();
 
    /// Create session relayed transaction
    const { data } = await sessionKey.populateTransaction.createSession(
      sessionId,
      3600,
      tempAddress
    );

    /// appending user's address to mimic GelatoRelay 
    const dataUser = ethers.utils.solidityPack(
      ["bytes", "address"],
      [data, deployer.address]
    );

    /// gelato impersonate
    const gelato = await ethers.getImpersonatedSigner(GelatoRelay);
    await setBalance(gelato.address, ethers.utils.parseEther("1"));

    /// Sending create session transaction
    const tx = await gelato.sendTransaction({
      to: sessionKey.address,
      data: dataUser,
    });
    await tx.wait();

    

    /// preparing fist execution
    const { data: dataTarget } = await perpMock.populateTransaction.setOrder(20000);;

    let { data: dataExecute } =
      await sessionKey.populateTransaction.executeCall(
        perpMock.address,
        dataTarget!,
        0,
        sessionId
      );

    /// appending user's tempaddress to mimic GelatoRelay 
    const dataCall = ethers.utils.solidityPack(
      ["bytes", "address"],
      [dataExecute, tempAddress]
    );

 
    let order = await perpMock.getOrder(1)
    expect(order.amount).to.equal(0);

    const tx2 = await gelato.sendTransaction({
      to: sessionKey.address,
      data: dataCall,
    });
    await tx2.wait();
    order = await perpMock.getOrder(1)
  
    expect(order.amount).to.equal(20000);

    let userOrders = await perpMock.nrOrdersByUser(deployer.address)
    expect(+userOrders.toString()).equal(1)



    await fastForwardTime(1800);

    const tx3 = await gelato.sendTransaction({
      to: sessionKey.address,
      data: dataCall,
    });
    await tx3.wait();
    order = await perpMock.getOrder(2)
    expect(order.amount).to.equal(20000);
 
    userOrders = await perpMock.nrOrdersByUser(deployer.address)
    expect(+userOrders.toString()).equal(2)


 
    //// execution should revert as tempkey is not allowed
    const tempKey2 = new TempKey();
    const tempAddress2 = tempKey2.address;
    const dataCall2 = ethers.utils.solidityPack(
      ["bytes", "address"],
      [dataExecute, tempAddress2]
    );
   await expect ( gelato.sendTransaction({
      to: sessionKey.address,
      data: dataCall2,
    })).to.be.revertedWith('tempKeyNotAllowed')

  //// execution should revert as session id is not valid
    const sessionIdWrong = uuidv4();
    const  {data:newdata}  =   await sessionKey.populateTransaction.executeCall(
        perpMock.address,
        dataCall,
        0,
        sessionIdWrong
      );

      const dataCallWrong = ethers.utils.solidityPack(
        ["bytes", "address"],
        [newdata, tempAddress]
      );

    await expect(gelato.sendTransaction({
      to: sessionKey.address,
      data: dataCallWrong,
    })).to.be.revertedWith('sessionNotInit')


    await fastForwardTime(2800);


  //// execution should revert as session key is expired
    await expect(
      gelato.sendTransaction({
        to: sessionKey.address,
        data: dataCall,
      })
    ).to.be.revertedWith("tempKeyExpired");



  });


 


});
