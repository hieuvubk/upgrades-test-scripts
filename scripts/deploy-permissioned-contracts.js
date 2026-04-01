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

class PermissionedDeploymentTester {
  constructor() {
    this.deployerEOA = null;      // Whitelisted admin account (only for deploying factory)
    this.issuerEOA = null;         // Non-whitelisted EOA (simulates issuer)
    this.factoryContract = null;
    this.testResults = [];
  }

  log(message) {
    console.log(message);
  }

  async initialize() {
    this.log(`\n${COLORS.BRIGHT}${COLORS.CYAN}=== Permissioned Contract Deployment Test ===${COLORS.RESET}`);
    this.log(`${COLORS.YELLOW}Testing factory-based deployment on permissioned Realio chain${COLORS.RESET}\n`);

    // Get signers
    const signers = await ethers.getSigners();
    this.deployerEOA = signers[0]; // Whitelisted deployer (admin)
    this.issuerEOA = signers[1];   // Non-whitelisted issuer

    this.log(`${COLORS.BRIGHT}Setup:${COLORS.RESET}`);
    this.log(`  Deployer EOA (whitelisted): ${this.deployerEOA.address}`);
    this.log(`  Issuer EOA (non-whitelisted): ${this.issuerEOA.address}`);
    
    const network = await ethers.provider.getNetwork();
    this.log(`  Network: ${network.name} (chainId: ${network.chainId})`);
    this.log("");
  }

  async deployFactory() {
    this.log(`${COLORS.BRIGHT}${COLORS.BLUE}Step 1: Deploy TestFactory Contract${COLORS.RESET}`);
    this.log(`  Deploying from whitelisted deployer EOA...`);

    try {
      const TestFactory = await ethers.getContractFactory("TestFactory", this.deployerEOA);
      this.factoryContract = await TestFactory.deploy();
      await this.factoryContract.waitForDeployment();

      const factoryAddress = await this.factoryContract.getAddress();
      this.log(`${COLORS.GREEN}  ✓ Factory deployed successfully${COLORS.RESET}`);
      this.log(`  Factory address: ${factoryAddress}`);
      this.log(`  Deployment tx: ${this.factoryContract.deploymentTransaction().hash}`);
      this.log("");

      return { success: true, address: factoryAddress };
    } catch (error) {
      this.log(`${COLORS.RED}  ✗ Factory deployment failed${COLORS.RESET}`);
      this.log(`  Error: ${error.message}`);
      this.log("");
      return { success: false, error: error.message };
    }
  }

  async testScenario1_DirectDeployFromNonWhitelisted() {
    this.log(`${COLORS.BRIGHT}${COLORS.BLUE}Scenario 1: Non-whitelisted EOA tries direct deployment${COLORS.RESET}`);
    this.log(`  Expected: ${COLORS.YELLOW}Should FAIL${COLORS.RESET} (permissioning blocks unauthorized deploys)`);
    this.log(`  Testing from issuer EOA: ${this.issuerEOA.address}`);

    try {
      const SimpleChild = await ethers.getContractFactory("SimpleChild", this.issuerEOA);
      const child = await SimpleChild.deploy("DirectDeploy", this.issuerEOA.address);
      await child.waitForDeployment();

      const childAddress = await child.getAddress();
      this.log(`${COLORS.RED}  ✗ UNEXPECTED: Deployment succeeded${COLORS.RESET}`);
      this.log(`  Child address: ${childAddress}`);
      this.log(`  ${COLORS.YELLOW}WARNING: Permissioning may not be active!${COLORS.RESET}`);
      this.log("");

      this.testResults.push({
        scenario: 1,
        name: "Direct deploy from non-whitelisted EOA",
        expected: "FAIL",
        actual: "SUCCESS",
        status: "UNEXPECTED",
        details: `Deployment succeeded at ${childAddress}`,
      });

      return { success: true, unexpected: true, address: childAddress };
    } catch (error) {
      this.log(`${COLORS.GREEN}  ✓ EXPECTED: Deployment failed${COLORS.RESET}`);
      this.log(`  Error: ${error.message}`);
      this.log(`  ${COLORS.GREEN}Permissioning is working correctly${COLORS.RESET}`);
      this.log("");

      this.testResults.push({
        scenario: 1,
        name: "Direct deploy from non-whitelisted EOA",
        expected: "FAIL",
        actual: "FAIL",
        status: "PASS",
        details: error.message,
      });

      return { success: false, expected: true, error: error.message };
    }
  }

  async testScenario2_FactoryDeployFromNonWhitelisted() {
    this.log(`${COLORS.BRIGHT}${COLORS.BLUE}Scenario 2: Non-whitelisted EOA calls factory.deploy()${COLORS.RESET}`);
    this.log(`  Expected: ${COLORS.GREEN}Should SUCCEED${COLORS.RESET} (factory has deploy rights)`);
    this.log(`  Caller: ${this.issuerEOA.address} (non-whitelisted)`);
    this.log(`  Factory: ${await this.factoryContract.getAddress()} (whitelisted)`);

    try {
      // Connect factory to issuer EOA
      const factoryAsIssuer = this.factoryContract.connect(this.issuerEOA);
      
      this.log(`  Calling factory.deploy("TestToken")...`);
      const tx = await factoryAsIssuer.deploy("TestToken");
      const receipt = await tx.wait();

      this.log(`${COLORS.GREEN}  ✓ SUCCESS: Factory deployment succeeded${COLORS.RESET}`);
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

      let childAddress = null;
      if (event) {
        const parsed = this.factoryContract.interface.parseLog(event);
        childAddress = parsed.args.child;
        this.log(`  Child contract deployed at: ${childAddress}`);
        this.log(`  Caller recorded in event: ${parsed.args.caller}`);
        this.log(`  Name recorded in event: ${parsed.args.name}`);
      }

      this.log("");

      this.testResults.push({
        scenario: 2,
        name: "Factory deploy from non-whitelisted EOA",
        expected: "SUCCESS",
        actual: "SUCCESS",
        status: "PASS",
        details: `Child deployed at ${childAddress}`,
        txHash: tx.hash,
      });

      return { success: true, childAddress, txHash: tx.hash };
    } catch (error) {
      this.log(`${COLORS.RED}  ✗ FAILED: Factory deployment failed${COLORS.RESET}`);
      this.log(`  Error: ${error.message}`);
      this.log(`  ${COLORS.RED}This indicates the chain may check tx.origin instead of msg.sender${COLORS.RESET}`);
      this.log("");

      this.testResults.push({
        scenario: 2,
        name: "Factory deploy from non-whitelisted EOA",
        expected: "SUCCESS",
        actual: "FAIL",
        status: "FAIL",
        details: error.message,
      });

      return { success: false, error: error.message };
    }
  }

  async testScenario3_VerifyChildContract(childAddress) {
    this.log(`${COLORS.BRIGHT}${COLORS.BLUE}Scenario 3: Verify deployed child contract${COLORS.RESET}`);
    this.log(`  Child address: ${childAddress}`);

    try {
      const SimpleChild = await ethers.getContractFactory("SimpleChild");
      const child = SimpleChild.attach(childAddress);

      const name = await child.name();
      const creator = await child.creator();

      this.log(`  Child contract name: ${name}`);
      this.log(`  Child contract creator: ${creator}`);
      this.log(`  Expected creator: ${this.issuerEOA.address}`);

      const nameCorrect = name === "TestToken";
      const creatorCorrect = creator.toLowerCase() === this.issuerEOA.address.toLowerCase();

      if (nameCorrect && creatorCorrect) {
        this.log(`${COLORS.GREEN}  ✓ Child contract is functional and correctly configured${COLORS.RESET}`);
        this.log("");

        this.testResults.push({
          scenario: 3,
          name: "Verify child contract",
          expected: "name='TestToken', creator=issuerEOA",
          actual: `name='${name}', creator=${creator}`,
          status: "PASS",
          details: "Child contract verified successfully",
        });

        return { success: true, name, creator };
      } else {
        this.log(`${COLORS.RED}  ✗ Child contract verification failed${COLORS.RESET}`);
        if (!nameCorrect) this.log(`    Name mismatch: expected 'TestToken', got '${name}'`);
        if (!creatorCorrect) this.log(`    Creator mismatch: expected ${this.issuerEOA.address}, got ${creator}`);
        this.log("");

        this.testResults.push({
          scenario: 3,
          name: "Verify child contract",
          expected: "name='TestToken', creator=issuerEOA",
          actual: `name='${name}', creator=${creator}`,
          status: "FAIL",
          details: "Child contract data mismatch",
        });

        return { success: false, name, creator };
      }
    } catch (error) {
      this.log(`${COLORS.RED}  ✗ Failed to verify child contract${COLORS.RESET}`);
      this.log(`  Error: ${error.message}`);
      this.log("");

      this.testResults.push({
        scenario: 3,
        name: "Verify child contract",
        expected: "name='TestToken', creator=issuerEOA",
        actual: "ERROR",
        status: "ERROR",
        details: error.message,
      });

      return { success: false, error: error.message };
    }
  }

  printSummary() {
    this.log(`\n${COLORS.BRIGHT}${COLORS.CYAN}=== Test Summary ===${COLORS.RESET}\n`);

    this.testResults.forEach((result) => {
      const statusColor =
        result.status === "PASS" ? COLORS.GREEN :
        result.status === "FAIL" ? COLORS.RED :
        result.status === "UNEXPECTED" ? COLORS.YELLOW :
        COLORS.RED;

      this.log(`${COLORS.BRIGHT}Scenario ${result.scenario}: ${result.name}${COLORS.RESET}`);
      this.log(`  Expected: ${result.expected}`);
      this.log(`  Actual: ${result.actual}`);
      this.log(`  Status: ${statusColor}${result.status}${COLORS.RESET}`);
      this.log(`  Details: ${result.details}`);
      if (result.txHash) this.log(`  Tx Hash: ${result.txHash}`);
      this.log("");
    });

    const allPassed = this.testResults.every(r => r.status === "PASS");

    if (allPassed) {
      this.log(`${COLORS.GREEN}${COLORS.BRIGHT}✓ ALL TESTS PASSED${COLORS.RESET}`);
      this.log(`${COLORS.GREEN}Factory-based deployment works correctly on permissioned chain${COLORS.RESET}`);
      this.log(`${COLORS.GREEN}Safe to proceed with REA-1019 platform integration${COLORS.RESET}\n`);
    } else {
      this.log(`${COLORS.RED}${COLORS.BRIGHT}✗ SOME TESTS FAILED${COLORS.RESET}`);
      this.log(`${COLORS.RED}Review the results above to understand the issue${COLORS.RESET}\n`);
    }
  }

  printAnalysis() {
    this.log(`${COLORS.BRIGHT}${COLORS.CYAN}=== Analysis ===${COLORS.RESET}\n`);

    const scenario1 = this.testResults.find(r => r.scenario === 1);
    const scenario2 = this.testResults.find(r => r.scenario === 2);
    const scenario3 = this.testResults.find(r => r.scenario === 3);

    if (scenario1?.status === "UNEXPECTED") {
      this.log(`${COLORS.YELLOW}⚠️  Scenario 1 Warning:${COLORS.RESET}`);
      this.log(`  Non-whitelisted EOA was able to deploy directly`);
      this.log(`  This suggests permissioning may not be active on this chain`);
      this.log(`  Verify chain configuration and whitelist settings\n`);
    }

    if (scenario2?.status === "PASS") {
      this.log(`${COLORS.GREEN}✓ Scenario 2 Success:${COLORS.RESET}`);
      this.log(`  Factory (whitelisted) can CREATE contracts when called by non-whitelisted EOA`);
      this.log(`  The chain checks msg.sender (factory) not tx.origin (issuer) at CREATE opcode`);
      this.log(`  This is the desired behavior for REA-1019\n`);
    } else if (scenario2?.status === "FAIL") {
      this.log(`${COLORS.RED}✗ Scenario 2 Failure:${COLORS.RESET}`);
      this.log(`  Factory deployment failed even though factory is whitelisted`);
      this.log(`  Possible causes:`);
      this.log(`    1. Chain checks tx.origin (issuer EOA) instead of msg.sender (factory)`);
      this.log(`    2. Factory contract address not properly whitelisted`);
      this.log(`    3. Permissioning config doesn't allow contract-initiated deploys`);
      this.log(`  Action required: Review chain permissioning configuration\n`);
    }

    if (scenario3?.status === "PASS") {
      this.log(`${COLORS.GREEN}✓ Scenario 3 Success:${COLORS.RESET}`);
      this.log(`  Child contract is functional and admin is correctly set to caller`);
      this.log(`  Factory pattern works as expected\n`);
    }
  }

  async run() {
    try {
      await this.initialize();

      // Deploy factory
      const factoryResult = await this.deployFactory();
      if (!factoryResult.success) {
        this.log(`${COLORS.RED}Cannot proceed: Factory deployment failed${COLORS.RESET}`);
        return;
      }

      this.log(`${COLORS.YELLOW}NOTE: Ensure factory address ${factoryResult.address} is whitelisted before continuing${COLORS.RESET}\n`);

      // Run test scenarios
      await this.testScenario1_DirectDeployFromNonWhitelisted();

      const scenario2Result = await this.testScenario2_FactoryDeployFromNonWhitelisted();

      if (scenario2Result.success && scenario2Result.childAddress) {
        await this.testScenario3_VerifyChildContract(scenario2Result.childAddress);
      } else {
        this.log(`${COLORS.YELLOW}Skipping Scenario 3: No child contract to verify${COLORS.RESET}\n`);
      }

      // Print results
      this.printSummary();
      this.printAnalysis();

    } catch (error) {
      this.log(`${COLORS.RED}${COLORS.BRIGHT}Fatal error:${COLORS.RESET}`);
      this.log(`${COLORS.RED}${error.message}${COLORS.RESET}`);
      console.error(error);
    }
  }
}

async function main() {
  const tester = new PermissionedDeploymentTester();
  await tester.run();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });


