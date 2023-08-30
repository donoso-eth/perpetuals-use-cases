import { PerpMock } from "../typechain/contracts/PerpMock";
import hre from "hardhat"
import { interval, take, takeUntil} from 'rxjs'

const createOrders = async (nrOrders:number) =>{

    const perpMock = (await hre.ethers.getContractAt(
        "PerpMock",
       "0x7c0d464B21552F3B8e0FDA2C74798e54CA0cAF7B"
      )) as PerpMock;

       //emit value in sequence every 1 second
const source = interval(1000);
//output: 0,1,2,3,4,5....
const subscribe = source.pipe(take(nrOrders)).subscribe(val =>  { 
    console.log(val)
    perpMock.setOrder(val) })


}

createOrders(10)