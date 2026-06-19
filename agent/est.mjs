import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import { createPublicClient, http, parseAbi, formatUnits } from "viem";
const circle = initiateDeveloperControlledWalletsClient({ apiKey: process.env.CIRCLE_API_KEY, entitySecret: process.env.CIRCLE_ENTITY_SECRET });
const FACTORY="0x4dCf3238dd90E571e82bC07fD876B384f170546c";
const arc=createPublicClient({transport:http("https://rpc.testnet.arc.network")});
const fee=await arc.readContract({address:FACTORY,abi:parseAbi(["function createFee() view returns (uint256)"]),functionName:"createFee"});
console.log("createFee wei:", fee.toString(), "=", formatUnits(fee,18),"USDC");
try{
  const r=await circle.estimateContractExecutionFee({
    walletId: process.env.CIRCLE_WALLET_ID,
    contractAddress: FACTORY,
    abiFunctionSignature: "createToken(string,string,string,string)",
    abiParameters: ["Test Agent 1","TAG1","","demo"],
    amount: formatUnits(fee,18),
  });
  console.log("estimate OK:", JSON.stringify(r.data).slice(0,400));
}catch(e){
  console.log("estimate ERR:", e.message?.slice(0,300));
  if(e.response?.data) console.log("detail:", JSON.stringify(e.response.data).slice(0,400));
}
