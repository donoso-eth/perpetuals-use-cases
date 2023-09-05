import { Signer } from "ethers";
import { PerpMock } from "../typechain/contracts/PerpMock";
import hre from "hardhat"
import { interval, take, takeUntil} from 'rxjs'
import { throws } from "assert";

const createOrders = async (nrOrders:number) =>{
    let admin: Signer; // proxyAdmin
  let adminAddress: string;
    [admin] = await hre.ethers.getSigners();

    adminAddress = await admin.getAddress();



    const perpMock = (await hre.ethers.getContractAt(
        "PerpMock",
        "0x17E2b1AED9CA9A5E63ff7b4736cE7657b28EB8f8"
      )) as PerpMock;

       //emit value in sequence every 1 second
const source = interval(2000);
//output: 0,1,2,3,4,5....
let nonce = await admin.getTransactionCount();
console.log(nonce);
let i= 0;
const subscribe = source.pipe(take(nrOrders)).subscribe(val =>  { 

    console.log(i,val)
    perpMock.setOrder(val) })
    i++;


}

createOrders(10)