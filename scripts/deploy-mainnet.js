// Deploys BotFlowRouter to BOT Chain Mainnet (677) with ethers.
// (Foundry path: OWNER=.. forge script script/Deploy.s.sol --rpc-url botchain --broadcast.)
// Mirrors script/Deploy.s.sol guards: chain id, BDEX router + WBOT code checks.
// Usage: PRIVATE_KEY=0x... [OWNER=0x...] [FEE_RECIPIENT=0x...] node scripts/deploy-mainnet.js
// OWNER defaults to the deployer (transferable later via two-step transfer).
const fs = require("fs");
const path = require("path");
const { JsonRpcProvider, Wallet, ContractFactory, isAddress } = require("/Users/apple/Documents/Default Project/Agent-Allowance/node_modules/ethers");

const RPC = process.env.MAINNET_RPC_URL || "https://rpc.botchain.ai";
const EXPLORER = "https://scan.botchain.ai";
const BDEX_ROUTER = process.env.BDEX_ROUTER || "0x07032d47A1b9f8460cBeE9dC17c1d3E438693929";
const WBOT = process.env.WBOT || "0xD5452816194a3784dBa983426cCe7c122F4abd30";

async function main() {
  const PK = process.env.PRIVATE_KEY;
  if (!PK) throw new Error("Set PRIVATE_KEY (mainnet deployer key).");
  const provider = new JsonRpcProvider(RPC);
  const chainId = Number((await provider.getNetwork()).chainId);
  if (chainId !== 677) throw new Error(`Refusing: chain is ${chainId}, not BOT Chain Mainnet (677).`);

  const wallet = new Wallet(PK, provider);
  const owner = process.env.OWNER && isAddress(process.env.OWNER) ? process.env.OWNER : wallet.address;
  const feeRecipient = process.env.FEE_RECIPIENT && isAddress(process.env.FEE_RECIPIENT) ? process.env.FEE_RECIPIENT : owner;
  for (const [n, a] of [["BDEX router", BDEX_ROUTER], ["WBOT", WBOT]]) {
    if ((await provider.getCode(a)) === "0x") throw new Error(`${n} has no code at ${a}. Stopping.`);
  }
  console.log(`Deployer: ${wallet.address}`);
  console.log(`Balance:  ${Number(await provider.getBalance(wallet.address)) / 1e18} BOT`);
  console.log(`Owner: ${owner} | Fee recipient: ${feeRecipient}`);

  const { abi, bytecode } = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "deployments", "botflow-router-artifact.json"), "utf8"));
  const factory = new ContractFactory(abi, bytecode, wallet);
  const txReq = await factory.getDeployTransaction(BDEX_ROUTER, WBOT, owner, feeRecipient);
  const gas = await provider.estimateGas({ ...txReq, from: wallet.address });
  console.log(`Estimated gas: ${gas}`);
  const contract = await factory.deploy(BDEX_ROUTER, WBOT, owner, feeRecipient);
  console.log(`Deploy tx: ${EXPLORER}/tx/${contract.deploymentTransaction().hash}`);
  await contract.waitForDeployment();
  const addr = await contract.getAddress();
  console.log(`BotFlowRouter: ${addr}`);
  console.log(`View: ${EXPLORER}/address/${addr}`);

  const record = {
    network: "botMainnet", chainId: 677, deployer: wallet.address,
    deployedAt: new Date().toISOString(),
    contracts: { BotFlowRouter: addr },
    constructorArgs: { bdexRouter: BDEX_ROUTER, wbot: WBOT, owner, feeRecipient },
    compiler: { version: "0.8.24+commit.e11b9ed9", optimizer: { enabled: true, runs: 200 }, evmVersion: "paris" },
  };
  fs.writeFileSync(path.join(__dirname, "..", "deployments", "botflow-mainnet.json"), JSON.stringify(record, null, 2) + "\n");
  console.log("Saved deployments/botflow-mainnet.json");
}

main().catch((e) => { console.error("DEPLOY FAILED:", e.shortMessage || e.message || e); process.exitCode = 1; });
