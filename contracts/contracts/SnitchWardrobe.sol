// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {Snitch} from "./Snitch.sol";

/// @title Snitch Wardrobe
/// @notice Cosmetics (ERC-1155) unlocked by stars won in `Snitch`. One of each per player.
///         This project is not audited, endorsed or operated by Zama. Use at your own risk.
contract SnitchWardrobe is ERC1155 {
    Snitch public immutable game;
    address public owner;
    uint256 public itemCount;
    mapping(uint256 id => uint32 stars) public starsFor;
    mapping(uint256 id => string name) public nameOf;
    mapping(address player => mapping(uint256 id => bool)) public claimed;

    event ItemAdded(uint256 indexed id, string name, uint32 stars);
    event ItemClaimed(address indexed player, uint256 indexed id);

    error NotOwner();
    error BadItem();
    error NotEnoughStars();
    error AlreadyClaimed();

    constructor(Snitch game_, string memory uri_) ERC1155(uri_) {
        game = game_;
        owner = msg.sender;
        _add("Gold chain", 3);
        _add("Fedora", 8);
        _add("Neon jacket", 15);
        _add("Echo's lighter", 24);
    }

    function setURI(string calldata uri_) external {
        if (msg.sender != owner) revert NotOwner();
        _setURI(uri_);
    }

    function addItem(string calldata name, uint32 stars) external {
        if (msg.sender != owner) revert NotOwner();
        _add(name, stars);
    }

    function _add(string memory name, uint32 stars) internal {
        uint256 id = ++itemCount;
        starsFor[id] = stars;
        nameOf[id] = name;
        emit ItemAdded(id, name, stars);
    }

    function claim(uint256 id) external {
        if (id == 0 || id > itemCount) revert BadItem();
        if (claimed[msg.sender][id]) revert AlreadyClaimed();
        if (game.totalStars(msg.sender) < starsFor[id]) revert NotEnoughStars();
        claimed[msg.sender][id] = true;
        _mint(msg.sender, id, 1, "");
        emit ItemClaimed(msg.sender, id);
    }
}
