import * as fs from "fs";
import * as path from "path";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

// npx hardhat deploy --network sepolia --tags SnitchRooms
const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const snitch = await hre.deployments.get("Snitch");
  const rooms = await hre.deployments.deploy("SnitchRooms", { from: deployer, args: [snitch.address], log: true });
  console.log(`SnitchRooms: ${rooms.address} (Snitch ${snitch.address}) on ${hre.network.name}`);

  // Export ABI + address for the frontend.
  const outDir = path.join(__dirname, "..", "abi");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "SnitchRooms.json"), JSON.stringify(rooms.abi, null, 2) + "\n");
  if (hre.network.name === "hardhat") return;
  const addrFile = path.join(outDir, "addresses.json");
  const addrs = fs.existsSync(addrFile) ? JSON.parse(fs.readFileSync(addrFile, "utf8")) : {};
  const chainId = (await hre.ethers.provider.getNetwork()).chainId.toString();
  addrs[chainId] = {
    ...(addrs[chainId] ?? {}),
    network: hre.network.name,
    SnitchRooms: rooms.address,
    snitchRoomsBlock: rooms.receipt?.blockNumber,
  };
  fs.writeFileSync(addrFile, JSON.stringify(addrs, null, 2) + "\n");
};
export default func;
func.id = "deploy_snitch_rooms";
func.tags = ["SnitchRooms"];
func.dependencies = ["Snitch"];
