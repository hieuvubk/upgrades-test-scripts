const hre = require("hardhat");
const { ethers } = require("hardhat");

// Color codes for console output
const COLORS = {
  RESET: "\x1b[0m",
  BRIGHT: "\x1b[1m",
  RED: "\x1b[31m",
  GREEN: "\x1b[32m",
  YELLOW: "\x1b[33m",
  BLUE: "\x1b[34m",
  CYAN: "\x1b[36m",
};

class FactoryDeployer {
  constructor() {
    this.factoryContract = null;
    this.deployerAddress = null;
  }

  log(message) {
    console.log(message);
  }

  async initialize() {
    this.log(`\n${COLORS.BRIGHT}${COLORS.CYAN}=== TestFactory Deployment ===${COLORS.RESET}\n`);

    // Get deployer
    const [deployer] = await ethers.getSigners();
    this.deployerAddress = deployer.address;

    // Get network info
    const network = await ethers.provider.getNetwork();
    const balance = await ethers.provider.getBalance(deployer.address);

    this.log(`${COLORS.BRIGHT}Deployment Configuration:${COLORS.RESET}`);
    this.log(`  Network: ${network.name}`);
    this.log(`  Chain ID: ${network.chainId}`);
    this.log(`  Deployer: ${this.deployerAddress}`);
    this.log(`  Balance: ${ethers.formatEther(balance)} ETH`);
    this.log("");
  }

  async deployFactory() {
    this.log(`${COLORS.BRIGHT}${COLORS.BLUE}Deploying TestFactory Contract...${COLORS.RESET}`);

    try {
      // Get contract factory
      const TestFactory = await ethers.getContractFactory("TestFactory");
      
      this.log(`  Deploying contract...`);
      
      // Deploy contract
      this.factoryContract = await TestFactory.deploy();
      
      this.log(`  Waiting for deployment confirmation...`);
      
      // Wait for deployment
      await this.factoryContract.waitForDeployment();

      const factoryAddress = await this.factoryContract.getAddress();
      const deployTx = this.factoryContract.deploymentTransaction();

      this.log(`${COLORS.GREEN}  ✓ TestFactory deployed successfully!${COLORS.RESET}`);
      this.log("");
      this.log(`${COLORS.BRIGHT}Deployment Details:${COLORS.RESET}`);
      this.log(`  Contract Address: ${COLORS.GREEN}${factoryAddress}${COLORS.RESET}`);
      this.log(`  Transaction Hash: ${deployTx.hash}`);
      this.log(`  Block Number: ${deployTx.blockNumber}`);
      this.log(`  Deployer: ${this.deployerAddress}`);
      
      // Get gas info
      if (deployTx.gasLimit) {
        this.log(`  Gas Limit: ${deployTx.gasLimit.toString()}`);
      }
      if (deployTx.gasPrice) {
        this.log(`  Gas Price: ${ethers.formatUnits(deployTx.gasPrice, "gwei")} gwei`);
      }

      this.log("");

      return {
        success: true,
        address: factoryAddress,
        txHash: deployTx.hash,
        blockNumber: deployTx.blockNumber,
      };
    } catch (error) {
      this.log(`${COLORS.RED}  ✗ Deployment failed${COLORS.RESET}`);
      this.log(`  Error: ${error.message}`);
      this.log("");
      
      return {
        success: false,
        error: error.message,
      };
    }
  }

  async verifyDeployment(factoryAddress) {
    this.log(`${COLORS.BRIGHT}${COLORS.BLUE}Verifying Deployment...${COLORS.RESET}`);

    try {
      // Get contract code
      const code = await ethers.provider.getCode(factoryAddress);
      
      if (code === "0x" || code === "0x0") {
        this.log(`${COLORS.RED}  ✗ No contract code found at address${COLORS.RESET}`);
        return { success: false };
      }

      this.log(`${COLORS.GREEN}  ✓ Contract code verified${COLORS.RESET}`);
      this.log(`  Code size: ${(code.length - 2) / 2} bytes`);
      this.log("");

      return { success: true };
    } catch (error) {
      this.log(`${COLORS.RED}  ✗ Verification failed${COLORS.RESET}`);
      this.log(`  Error: ${error.message}`);
      this.log("");
      
      return { success: false, error: error.message };
    }
  }

  printNextSteps(factoryAddress) {
    this.log(`${COLORS.BRIGHT}${COLORS.CYAN}=== Next Steps ===${COLORS.RESET}\n`);
    
    this.log(`${COLORS.YELLOW}1. Whitelist the Factory Contract${COLORS.RESET}`);
    this.log(`   Add this address to the deployment whitelist:`);
    this.log(`   ${COLORS.GREEN}${factoryAddress}${COLORS.RESET}\n`);
    
    this.log(`${COLORS.YELLOW}2. Test Factory Deployment${COLORS.RESET}`);
    this.log(`   Run the permissioned deployment test:`);
    this.log(`   ${COLORS.CYAN}npm run test:permissioned${COLORS.RESET}\n`);
    
    this.log(`${COLORS.YELLOW}3. Deploy Child Contract${COLORS.RESET}`);
    this.log(`   Call factory.deploy("TokenName") from any EOA:`);
    this.log(`   ${COLORS.CYAN}const factory = await ethers.getContractAt("TestFactory", "${factoryAddress}");${COLORS.RESET}`);
    this.log(`   ${COLORS.CYAN}const tx = await factory.deploy("MyToken");${COLORS.RESET}\n`);
    
    this.log(`${COLORS.YELLOW}4. Save Factory Address${COLORS.RESET}`);
    this.log(`   Add to your .env file:`);
    this.log(`   ${COLORS.CYAN}FACTORY_ADDRESS=${factoryAddress}${COLORS.RESET}\n`);
  }

  async run() {
    try {
      await this.initialize();
      
      const deployResult = await this.deployFactory();
      
      if (!deployResult.success) {
        this.log(`${COLORS.RED}${COLORS.BRIGHT}Deployment failed. Exiting.${COLORS.RESET}`);
        return;
      }

      const verifyResult = await this.verifyDeployment(deployResult.address);
      
      if (!verifyResult.success) {
        this.log(`${COLORS.YELLOW}${COLORS.BRIGHT}Warning: Verification failed${COLORS.RESET}`);
      }

      this.printNextSteps(deployResult.address);

      this.log(`${COLORS.GREEN}${COLORS.BRIGHT}✓ Deployment Complete!${COLORS.RESET}\n`);

    } catch (error) {
      this.log(`${COLORS.RED}${COLORS.BRIGHT}Fatal error:${COLORS.RESET}`);
      this.log(`${COLORS.RED}${error.message}${COLORS.RESET}`);
      console.error(error);
    }
  }
}

async function main() {
  const deployer = new FactoryDeployer();
  await deployer.run();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

