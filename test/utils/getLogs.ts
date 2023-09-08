import { Log, Provider } from "@ethersproject/providers";

const MAX_RANGE = 5000; // limit range of events to comply with rpc providers
const MAX_REQUESTS = 10; // limit number of requests on every execution to avoid hitting timeout

export const getLogs = async (
  lastBlock: number,
  currentBlock: number,
  contractAddress: string,
  topics: any,
  provider: Provider
):Promise<{ logs:Log[], toBlock:number }> => {
;
  const logs: Log[] = [];
  let nbRequests = 0;
  let toBlock = lastBlock;
  while (lastBlock < currentBlock && nbRequests < MAX_REQUESTS) {
    nbRequests++;
    const fromBlock = lastBlock + 1;
    toBlock = Math.min(fromBlock + MAX_RANGE, currentBlock);
    console.log(`Fetching log events from blocks ${fromBlock} to ${toBlock}`);
    try {
      const eventFilter = {
        address: contractAddress,
        topics,
        fromBlock,
        toBlock,
      };
      const result = await provider.getLogs(eventFilter);
      logs.push(...result);
      lastBlock = toBlock;
      return {logs:logs,toBlock};
    } catch (err) {
      console.log(`Rpc call failed: ${(err as Error).message}`);
      return{logs:[],toBlock};
    }
  }
  return {logs:logs,toBlock:toBlock};
};
