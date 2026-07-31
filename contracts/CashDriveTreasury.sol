// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract CashDriveTreasury {
    address public admin;
    mapping(address => uint256) public balances;
    
    event Allocation(address indexed seller, address indexed affiliate, uint256 sellerAmount, uint256 affiliateAmount);
    event Claimed(address indexed user, uint256 amount);

    constructor() {
        admin = msg.sender;
    }

    // Required to receive standard HBAR transfers from x402 clients
    receive() external payable {}

    /**
     * @dev Called by the CashDrive backend immediately after a purchase settles.
     * Assigns the HBAR that was just deposited to the seller and affiliate.
     */
    function allocate(
        address seller, 
        address affiliate, 
        uint256 sellerAmount, 
        uint256 affiliateAmount
    ) external {
        require(msg.sender == admin, "Only admin can allocate");
        
        // Ensure the contract actually holds enough HBAR to cover this new allocation
        // (This protects against allocating funds that haven't been deposited)
        uint256 totalAllocated = sellerAmount + affiliateAmount;
        require(address(this).balance >= totalAllocated, "Insufficient contract balance");

        balances[seller] += sellerAmount;
        if (affiliate != address(0) && affiliateAmount > 0) {
            balances[affiliate] += affiliateAmount;
        }
        
        emit Allocation(seller, affiliate, sellerAmount, affiliateAmount);
    }
    
    function claim() external {
        uint256 amount = balances[msg.sender];
        require(amount > 0, "No funds to claim");
        
        balances[msg.sender] = 0;
        (bool success, ) = msg.sender.call{value: amount}("");
        require(success, "Transfer failed");
        
        emit Claimed(msg.sender, amount);
    }
}
