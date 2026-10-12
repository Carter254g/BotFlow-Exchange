// Compiles src/BotFlowRouter.sol with solc 0.8.24 (optimizer 200 runs, paris),
// mirroring foundry.toml. Used because forge binaries were unavailable.
// Outputs deployments/botflow-router-artifact.json { abi, bytecode }.
const fs = require("fs");
const path = require("path");
const solc = require("/Users/apple/Documents/Default Project/Agent-Allowance/node_modules/solc");

const ROOT = path.join(__dirname, "..");
const SRC = path.join(ROOT, "src", "BotFlowRouter.sol");

function findImports(importPath) {
  try {
    let full;
    if (importPath.startsWith("@openzeppelin/")) {
      // @openzeppelin/contracts/... -> lib/openzeppelin-contracts/contracts/...
      full = path.join(ROOT, "lib", importPath.replace("@openzeppelin/contracts/", "openzeppelin-contracts/contracts/"));
    } else if (importPath.startsWith("src/")) {
      // solc pre-joins relative imports against the importing unit path
      full = path.join(ROOT, importPath);
    } else if (importPath.startsWith("./") || importPath.startsWith("../")) {
      full = path.join(ROOT, "src", importPath);
    } else {
      return { error: "unresolvable: " + importPath };
    }
    return { contents: fs.readFileSync(full, "utf8") };
  } catch (e) {
    return { error: String(e.message || e) };
  }
}

const input = {
  language: "Solidity",
  sources: { "src/BotFlowRouter.sol": { content: fs.readFileSync(SRC, "utf8") } },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    evmVersion: "paris",
    outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
  },
};

const out = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }));
if (out.errors) {
  for (const e of out.errors) console.error(e.severity + ": " + e.formattedMessage);
  if (out.errors.some((e) => e.severity === "error")) process.exit(1);
}
const c = out.contracts["src/BotFlowRouter.sol"]["BotFlowRouter"];
fs.mkdirSync(path.join(ROOT, "deployments"), { recursive: true });
fs.writeFileSync(
  path.join(ROOT, "deployments", "botflow-router-artifact.json"),
  JSON.stringify({ contractName: "BotFlowRouter", abi: c.abi, bytecode: "0x" + c.evm.bytecode.object }, null, 2)
);
console.log("bytecode bytes:", c.evm.bytecode.object.length / 2);
console.log("wrote deployments/botflow-router-artifact.json");
