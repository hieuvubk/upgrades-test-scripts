// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title SimpleChild
 * @dev A simple child contract deployed by the factory
 */
contract SimpleChild {
    string public name;
    address public creator;

    constructor(string memory _name, address _admin) {
        name = _name;
        creator = _admin;
    }
}

/**
 * @title TestFactory
 * @dev Factory contract that deploys child contracts
 * This contract is whitelisted for deployment on the permissioned Realio chain
 * It allows non-whitelisted EOAs to deploy child contracts through this factory
 */
contract TestFactory {
    event ChildDeployed(address indexed child, address indexed caller, string name);

    /**
     * @dev Deploy a new child contract
     * @param _name The name for the child contract
     * @return The address of the deployed child contract
     */
    function deploy(string memory _name) external returns (address) {
        SimpleChild child = new SimpleChild(_name, msg.sender);
        emit ChildDeployed(address(child), msg.sender, _name);
        return address(child);
    }

    /**
     * @dev Get the number of deployed children (for testing)
     * @return The count of deployed children
     */
    function getDeploymentCount() external pure returns (uint256) {
        return 1; // Placeholder - would need state tracking in real implementation
    }
}

