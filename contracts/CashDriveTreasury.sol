// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract CashDriveTreasury {
    address public admin;
    mapping(address => uint256) public balances;
    
    event Allocation(address indexed seller, address indexed affiliate, uint256 sellerAmount, uint256 affiliateAmount);
    event Claimed(address indexed user, uint256 amount);
    event DebugClaim(address indexed caller, uint256 balance);

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
        // The backend verifies the deposit before calling allocate.

        balances[seller] += sellerAmount;
        if (affiliate != address(0) && affiliateAmount > 0) {
            balances[affiliate] += affiliateAmount;
        }
        
        emit Allocation(seller, affiliate, sellerAmount, affiliateAmount);
    }
    
    function claim() external {
        uint256 amount = balances[msg.sender];
        emit DebugClaim(msg.sender, amount);
        require(amount > 0, "No funds to claim");
        
        balances[msg.sender] = 0;
        uint256 amountWei = amount * 10**10;
        (bool success, ) = msg.sender.call{value: amountWei}("");
        require(success, "HBAR Transfer Failed!");
        
        emit Claimed(msg.sender, amount);
    }
}
