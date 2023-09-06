// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import "hardhat/console.sol";
import {GelatoBytes} from "../gelato/GelatoBytes.sol";
import {
    ERC2771Context
} from "@gelatonetwork/relay-context/contracts/vendor/ERC2771Context.sol";

struct SessionGate {
    uint256 end;
    address user;
    address tempPublicKey;
}

contract SessionKeyGate is ERC2771Context {
    mapping(bytes32 => SessionGate) public sessions;

      event SetSession(bytes32 sessionKey);

    //// TrustedForwarder is Gelato 1Balance ERC2771
    constructor(address _trustedForwarder) ERC2771Context(_trustedForwarder) {}

    function createSession(
        string memory _sessionId,
        uint256 _duration,
        address _tmpPublicKey
    ) external {
        require(isTrustedForwarder(msg.sender), "onlyGelatoRelayERC2771");

        bytes32 sessionId = keccak256(abi.encodePacked(_sessionId));

        sessions[sessionId] = SessionGate(
            block.timestamp + _duration,
            _msgSender(),
            _tmpPublicKey
        );


    emit SetSession(sessionId);
    }

    function executeCall(
        address _target,
        bytes calldata _data,
        uint256 _value,
        string memory _sessionId
    ) external {
          bytes32 sessionId = keccak256(abi.encodePacked(_sessionId));
        SessionGate memory _sessionGate = sessions[sessionId ];

        require(isTrustedForwarder(msg.sender),"onlyGelatoRelayERC2771");
        require(_sessionGate.user != address(0), 'sessionNotInit');
        require(_sessionGate.tempPublicKey == _msgSender(), 'tempKeyNotAllowed');
        require(_sessionGate.end >= block.timestamp, 'tempKeyExpired');

     

        bytes memory _dataWithUser = abi.encodePacked(_data, _sessionGate.user);

        (, bytes memory returnData) = _call(
            _target,
            _dataWithUser,
            _value,
            true,
            "SessionKeyGate.executeCall: "
        );
    }

    function _call(
        address _add,
        bytes memory _data,
        uint256 _value,
        bool _revertOnFailure,
        string memory _tracingInfo
    ) internal returns (bool success, bytes memory returnData) {
        (success, returnData) = _add.call{value: _value}(_data);

        if (!success && _revertOnFailure)
            GelatoBytes.revertWithError(returnData, _tracingInfo);
    }
}
