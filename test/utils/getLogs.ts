import { Log, Provider } from "@ethersproject/providers";

const MAX_RANGE = 100; // limit range of events to comply with rpc providers
const MAX_REQUESTS = 100; // limit number of requests on every execution to avoid hitting timeout

export const getLogs = async (
  lastBlock: number,
  currentBlock: number,
  contractAddress: string,
  topics: any,
  provider: Provider
) => {
;
  const logs: Log[] = [];
  let nbRequests = 0;
  while (lastBlock < currentBlock && nbRequests < MAX_REQUESTS) {
    nbRequests++;
    const fromBlock = lastBlock + 1;
    const toBlock = Math.min(fromBlock + MAX_RANGE, currentBlock);
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
      return logs;
    } catch (err) {
      console.log(`Rpc call failed: ${(err as Error).message}`);
      return [];
    }
  }
  return logs;
};
