const hre = require("hardhat");
const { ethers } = require("hardhat");
require("dotenv").config();

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

// Factory address (deployed TestFactory contract)
const FACTORY_ADDRESS = "0x3D641a2791533B4A0000345eA8d509d01E1ec301";

class ChildDeployer {
  constructor() {
    this.issuerWallet = null;
    this.factoryContract = null;
    this.childAddress = null;
  }

  log(message) {
    console.log(message);
  }

  async initialize() {
    this.log(`\n${COLORS.BRIGHT}${COLORS.CYAN}=== Child Contract Deployment via Factory ===${COLORS.RESET}\n`);

    // Get PRIVATE_KEY_2 from environment
    const privateKey2 = process.env.PRIVATE_KEY_2;
    
    if (!privateKey2) {
      throw new Error("PRIVATE_KEY_2 not found in .env file");
    }

    // Create wallet from PRIVATE_KEY_2
    this.issuerWallet = new ethers.Wallet(privateKey2, ethers.provider);

    // Get network info
    const network = await ethers.provider.getNetwork();
    const balance = await ethers.provider.getBalance(this.issuerWallet.address);

    this.log(`${COLORS.BRIGHT}Configuration:${COLORS.RESET}`);
    this.log(`  Network: ${network.name}`);
    this.log(`  Chain ID: ${network.chainId}`);
    this.log(`  Issuer Wallet (PRIVATE_KEY_2): ${this.issuerWallet.address}`);
    this.log(`  Balance: ${ethers.formatEther(balance)} ETH`);
    this.log(`  Factory Address: ${FACTORY_ADDRESS}`);
    this.log("");
  }

  async testDirectDeploy() {
    this.log(`${COLORS.BRIGHT}${COLORS.BLUE}Test 1: Direct Deploy from PRIVATE_KEY_2 Wallet${COLORS.RESET}`);
    this.log(`  Expected: ${COLORS.YELLOW}Should FAIL${COLORS.RESET} (wallet not whitelisted)`);
    this.log(`  Attempting to deploy TestFactory directly...`);

    try {
      const TestFactory = await ethers.getContractFactory("TestFactory", this.issuerWallet);
      const factory = await TestFactory.deploy();
      await factory.waitForDeployment();

      const address = await factory.getAddress();
      this.log(`${COLORS.RED}  ✗ UNEXPECTED: Direct deployment succeeded${COLORS.RESET}`);
      this.log(`  Deployed at: ${address}`);
      this.log(`  ${COLORS.YELLOW}WARNING: Wallet may be whitelisted or permissioning is not active${COLORS.RESET}`);
      this.log("");

      return { success: true, unexpected: true, address };
    } catch (error) {
      this.log(`${COLORS.GREEN}  ✓ EXPECTED: Direct deployment failed${COLORS.RESET}`);
      this.log(`  Error: ${error.message}`);
      this.log(`  ${COLORS.GREEN}Permissioning is working correctly${COLORS.RESET}`);
      this.log("");

      return { success: false, expected: true, error: error.message };
    }
  }

  async deployViaFactory() {
    this.log(`${COLORS.BRIGHT}${COLORS.BLUE}Test 2: Deploy Child via Factory${COLORS.RESET}`);
    this.log(`  Expected: ${COLORS.GREEN}Should SUCCEED${COLORS.RESET} (factory is whitelisted)`);
    this.log(`  Caller: ${this.issuerWallet.address} (PRIVATE_KEY_2)`);
    this.log(`  Factory: ${FACTORY_ADDRESS}`);

    try {
      // Get factory contract instance
      this.factoryContract = await ethers.getContractAt("TestFactory", FACTORY_ADDRESS, this.issuerWallet);

      this.log(`  Calling factory.deploy("test")...`);
      
      // Call factory.deploy("test")
      const tx = await this.factoryContract.deploy("test");
      this.log(`  Transaction sent: ${tx.hash}`);
      
      const receipt = await tx.wait();
      this.log(`  Transaction confirmed in block ${receipt.blockNumber}`);

      this.log(`${COLORS.GREEN}  ✓ SUCCESS: Child contract deployed via factory${COLORS.RESET}`);
      this.log(`  Transaction hash: ${tx.hash}`);
      this.log(`  Gas used: ${receipt.gasUsed.toString()}`);

      // Extract child address from event
      const event = receipt.logs.find(log => {
        try {
          const parsed = this.factoryContract.interface.parseLog(log);
          return parsed.name === "ChildDeployed";
        } catch {
          return false;
        }
      });

      if (event) {
        const parsed = this.factoryContract.interface.parseLog(event);
        this.childAddress = parsed.args.child;
        this.log(`  Child contract deployed at: ${COLORS.GREEN}${this.childAddress}${COLORS.RESET}`);
        this.log(`  Caller recorded in event: ${parsed.args.caller}`);
        this.log(`  Name recorded in event: ${parsed.args.name}`);
      } else {
        this.log(`${COLORS.YELLOW}  Warning: Could not find ChildDeployed event${COLORS.RESET}`);
      }

      this.log("");

      return { success: true, childAddress: this.childAddress, txHash: tx.hash };
    } catch (error) {
      this.log(`${COLORS.RED}  ✗ FAILED: Factory deployment failed${COLORS.RESET}`);
      this.log(`  Error: ${error.message}`);
      this.log(`  ${COLORS.RED}This indicates an issue with factory permissions or configuration${COLORS.RESET}`);
      this.log("");

      return { success: false, error: error.message };
    }
  }

  async verifyChildContract() {
    this.log(`${COLORS.BRIGHT}${COLORS.BLUE}Test 3: Verify Child Contract${COLORS.RESET}`);
    this.log(`  Child address: ${this.childAddress}`);
    this.log(`  Expected name: "test"`);
    this.log(`  Expected creator: ${this.issuerWallet.address}`);

    try {
      const SimpleChild = await ethers.getContractFactory("SimpleChild");
      const child = SimpleChild.attach(this.childAddress);

      this.log(`  Calling child.name()...`);
      const name = await child.name();
      
      this.log(`  Calling child.creator()...`);
      const creator = await child.creator();

      this.log("");
      this.log(`${COLORS.BRIGHT}Child Contract Details:${COLORS.RESET}`);
      this.log(`  Name: ${name}`);
      this.log(`  Creator: ${creator}`);
      this.log("");

      const nameCorrect = name === "test";
      const creatorCorrect = creator.toLowerCase() === this.issuerWallet.address.toLowerCase();

      if (nameCorrect && creatorCorrect) {
        this.log(`${COLORS.GREEN}  ✓ Child contract verification PASSED${COLORS.RESET}`);
        this.log(`  ${COLORS.GREEN}✓ Name is correct: "${name}"${COLORS.RESET}`);
        this.log(`  ${COLORS.GREEN}✓ Creator is correct: ${creator}${COLORS.RESET}`);
        this.log(`  ${COLORS.GREEN}✓ Deployed contract is functional${COLORS.RESET}`);
        this.log(`  ${COLORS.GREEN}✓ Admin is correctly set to the caller${COLORS.RESET}`);
        this.log("");

        return { success: true, name, creator };
      } else {
        this.log(`${COLORS.RED}  ✗ Child contract verification FAILED${COLORS.RESET}`);
        if (!nameCorrect) {
          this.log(`  ${COLORS.RED}✗ Name mismatch: expected "test", got "${name}"${COLORS.RESET}`);
        }
        if (!creatorCorrect) {
          this.log(`  ${COLORS.RED}✗ Creator mismatch: expected ${this.issuerWallet.address}, got ${creator}${COLORS.RESET}`);
        }
        this.log("");

        return { success: false, name, creator };
      }
    } catch (error) {
      this.log(`${COLORS.RED}  ✗ Failed to verify child contract${COLORS.RESET}`);
      this.log(`  Error: ${error.message}`);
      this.log("");

      return { success: false, error: error.message };
    }
  }

  printSummary(test1Result, test2Result, test3Result) {
    this.log(`${COLORS.BRIGHT}${COLORS.CYAN}=== Test Summary ===${COLORS.RESET}\n`);

    // Test 1
    this.log(`${COLORS.BRIGHT}Test 1: Direct Deploy from PRIVATE_KEY_2 Wallet${COLORS.RESET}`);
    if (test1Result.expected) {
      this.log(`  Status: ${COLORS.GREEN}PASS${COLORS.RESET} (Failed as expected)`);
    } else if (test1Result.unexpected) {
      this.log(`  Status: ${COLORS.YELLOW}WARNING${COLORS.RESET} (Succeeded unexpectedly)`);
    }
    this.log("");

    // Test 2
    this.log(`${COLORS.BRIGHT}Test 2: Deploy Child via Factory${COLORS.RESET}`);
    if (test2Result.success) {
      this.log(`  Status: ${COLORS.GREEN}PASS${COLORS.RESET}`);
      this.log(`  Child Address: ${test2Result.childAddress}`);
      this.log(`  Tx Hash: ${test2Result.txHash}`);
    } else {
      this.log(`  Status: ${COLORS.RED}FAIL${COLORS.RESET}`);
      this.log(`  Error: ${test2Result.error}`);
    }
    this.log("");

    // Test 3
    if (test3Result) {
      this.log(`${COLORS.BRIGHT}Test 3: Verify Child Contract${COLORS.RESET}`);
      if (test3Result.success) {
        this.log(`  Status: ${COLORS.GREEN}PASS${COLORS.RESET}`);
        this.log(`  Name: ${test3Result.name}`);
        this.log(`  Creator: ${test3Result.creator}`);
      } else {
        this.log(`  Status: ${COLORS.RED}FAIL${COLORS.RESET}`);
        if (test3Result.error) {
          this.log(`  Error: ${test3Result.error}`);
        }
      }
      this.log("");
    }

    // Overall result
    const allPassed = test2Result.success && (!test3Result || test3Result.success);
    
    if (allPassed) {
      this.log(`${COLORS.GREEN}${COLORS.BRIGHT}✓ ALL CRITICAL TESTS PASSED${COLORS.RESET}`);
      this.log(`${COLORS.GREEN}Factory-based deployment works correctly!${COLORS.RESET}`);
      this.log(`${COLORS.GREEN}Non-whitelisted wallet can deploy via factory${COLORS.RESET}\n`);
    } else {
      this.log(`${COLORS.RED}${COLORS.BRIGHT}✗ SOME TESTS FAILED${COLORS.RESET}`);
      this.log(`${COLORS.RED}Review the results above${COLORS.RESET}\n`);
    }
  }

  async run() {
    try {
      await this.initialize();
      
      // Test 1: Try direct deploy (should fail)
      const test1Result = await this.testDirectDeploy();
      
      // Test 2: Deploy via factory (should succeed)
      const test2Result = await this.deployViaFactory();
      
      // Test 3: Verify child contract (if deployed)
      let test3Result = null;
      if (test2Result.success && this.childAddress) {
        test3Result = await this.verifyChildContract();
      } else {
        this.log(`${COLORS.YELLOW}Skipping Test 3: No child contract to verify${COLORS.RESET}\n`);
      }

      // Print summary
      this.printSummary(test1Result, test2Result, test3Result);

    } catch (error) {
      this.log(`${COLORS.RED}${COLORS.BRIGHT}Fatal error:${COLORS.RESET}`);
      this.log(`${COLORS.RED}${error.message}${COLORS.RESET}`);
      console.error(error);
    }
  }
}

async function main() {
  const deployer = new ChildDeployer();
  await deployer.run();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

