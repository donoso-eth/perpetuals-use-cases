// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "hardhat/console.sol";

import {Counters} from "@openzeppelin/contracts/utils/Counters.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

import {Pausable} from "@openzeppelin/contracts/security/Pausable.sol";
import {IPyth} from "@pythnetwork/pyth-sdk-solidity/IPyth.sol";
import {PythStructs} from "@pythnetwork/pyth-sdk-solidity/PythStructs.sol";
import {Context} from "@openzeppelin/contracts/metatx/ERC2771Context.sol";
import {
    ERC2771Context
} from "@gelatonetwork/relay-context/contracts/vendor/ERC2771Context.sol";

contract PerpMock is ERC2771Context, Pausable, Ownable {
    struct Order {
        uint256 timestamp;
        uint256 amount;
        int64 price;
        uint256 publishTime;
        bool above;
        uint256 leverage;
    }

 

    IPyth private _pyth;
    mapping(uint256 => int64) priceByTimestamp;

    // Order Settlement
    uint256 public orderId;
    mapping(uint256 => Order) public ordersByOrderId;
    mapping(address => uint256[]) public ordersByUser;
    mapping(address => uint256) public nrOrdersByUser;
    event setOrderEvent(uint256 timestamp, uint256 orderId);

    // Conditional Orders
    uint256 public conditionalOrderId;
    mapping(uint256 => Order) public conditionalOrdersByOrderId;
    mapping(address => uint256[]) public conditionalOrdersByUser;
    mapping(address => uint256) public nrConditionalOrdersByUser;
    event setConditionalOrderEvent(
        uint256 timestamp,
        uint256 orderId,
        int64 price,
        bool above
    );

    // Margin Trading
    uint256 public marginTradeId;
    mapping(uint256 => Order) public marginTradesByOrderId;
    mapping(address => uint256[]) public marginTradesByUser;
    mapping(address => uint256) public nrMarginTradesByUser;
    event marginTradeEvent(
        uint256 timestamp,
        uint256 orderId,
        uint256 amount,
        uint256 leverage
    );
    event updateCollateralEvent(uint256 orderId, uint256 amount, bool add);

    address public immutable gelatoMsgSender;

    modifier onlyGelatoMsgSender() {
        require(
            msg.sender == gelatoMsgSender,
            "Only dedicated gelato msg.sender"
        );
        _;
    }

    constructor(address _gelatoMsgSender, address pythContract, address _trustedForwarder)ERC2771Context(_trustedForwarder) {
        gelatoMsgSender = _gelatoMsgSender;
        _pyth = IPyth(pythContract);
      
    }

    /* solhint-disable-next-line no-empty-blocks */
    receive() external payable {}

    // #region ============ ===============  Settle Order Implementation ============= ============= //
    function setOrder(uint256 _amount) external {
        orderId += 1;
        ordersByOrderId[orderId] = Order(
            block.timestamp,
            _amount,
            0,
            0,
            true,
            0
        );
        ordersByUser[_msgSender()].push(orderId);
        nrOrdersByUser[_msgSender()] += 1;
        emit setOrderEvent(block.timestamp, orderId);
    }

    function updatePriceOrders(
        bytes[] memory updatePriceData,
        uint256[] memory _orders,
        uint256 _timestamp
    ) external onlyGelatoMsgSender {
        PythStructs.Price memory checkPrice = checkAvailablePrice(
            updatePriceData,
            _timestamp
        );

        for (uint256 i = 0; i < _orders.length; i++) {
            Order storage order = ordersByOrderId[_orders[i]];
            require(
                order.timestamp + 12 < checkPrice.publishTime,
                "NOT 12 sec elapsed"
            );

            order.price = checkPrice.price;
            order.publishTime = checkPrice.publishTime;
        }
    }

    // #endregion ============ =============== ============= ============= ===============  ===============  //

    // #region ============ ===============  Conditional Order Implementation ============= ============= //
    function setConditionalOrder(
        uint256 _amount,
        int64 _price,
        bool _above
    ) external {
        conditionalOrderId += 1;
        conditionalOrdersByOrderId[conditionalOrderId] = Order(
            block.timestamp,
            _amount,
            0,
            0,
            _above,
            0
        );
        conditionalOrdersByUser[_msgSender()].push(conditionalOrderId);
        nrConditionalOrdersByUser[_msgSender()] += 1;
        emit setConditionalOrderEvent(
            block.timestamp,
            conditionalOrderId,
            _price,
            _above
        );
    }

    function updatePriceConditionalOrders(
        bytes[] memory updatePriceData,
        uint256[] memory _conditionalOrders,
        uint256 _timestamp
    ) external onlyGelatoMsgSender {
        PythStructs.Price memory checkPrice = checkAvailablePrice(
            updatePriceData,
            _timestamp
        );

        for (uint256 i = 0; i < _conditionalOrders.length; i++) {
            Order storage conditionalOrder = conditionalOrdersByOrderId[
                _conditionalOrders[i]
            ];
            conditionalOrder.price = checkPrice.price;
            conditionalOrder.publishTime = checkPrice.publishTime;
        }
    }

    // #endregion ============ =============== ============= ============= ===============  ===============  //

    // #region ============ ===============  Liquidations Implementation ============= ============= //

    function marginTrade(uint256 _leverage, uint256 _amount) external {
        require(_amount > 0, "Amount Positive");
        marginTradeId += 1;
        marginTradesByOrderId[marginTradeId] = Order(
            block.timestamp,
            _amount,
            0,
            0,
            false,
            _leverage
        );
        marginTradesByUser[_msgSender()].push(marginTradeId);
        nrMarginTradesByUser[_msgSender()] += 1;
        emit marginTradeEvent(
            block.timestamp,
            marginTradeId,
            _amount,
            _leverage
        );
    }

    function updateCollateral(
        uint256 _orderId,
        uint256 _amount,
        bool _add
    ) external {
        require(marginTradesByOrderId[_orderId].amount != 0, "No Margin Trade");
        if (_add) {
            marginTradesByOrderId[_orderId].amount += _amount;
        } else {
            require(
                marginTradesByOrderId[_orderId].amount > _amount,
                "Removing colateral higher than available"
            );
            marginTradesByOrderId[_orderId].amount -= _amount;
        }
        emit updateCollateralEvent(_orderId, _amount, _add);
    }

    function liquidate(
        uint256[] memory _tradesLiquidated,
        uint256 _timestamp
    ) external onlyGelatoMsgSender {
        for (uint256 i = 0; i < _tradesLiquidated.length; i++) {
            Order storage liquidateTrade = marginTradesByOrderId[
                _tradesLiquidated[i]
            ];
            liquidateTrade.price = 0;
            liquidateTrade.publishTime = _timestamp;
            liquidateTrade.leverage = 0;
            liquidateTrade.amount = 0;
        }
    }

    // #endregion ============ =============== ============= ============= ===============  ===============  //
    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function withdraw() external onlyOwner returns (bool) {
        (bool result, ) = payable(msg.sender).call{
            value: address(this).balance
        }("");
        return result;
    }

    function getConditionalOrder(
        uint256 _order
    ) public view returns (Order memory) {
        return conditionalOrdersByOrderId[_order];
    }

    function getOrder(uint256 _order) public view returns (Order memory) {
        return ordersByOrderId[_order];
    }

    function getMargonTrade(uint256 _order) public view returns (Order memory) {
        return marginTradesByOrderId[_order];
    }

    // internal

    function checkAvailablePrice(
        bytes[] memory updatePriceData,
        uint256 _timestamp
    ) internal returns (PythStructs.Price memory checkPrice) {
        if (priceByTimestamp[_timestamp] != 0) {
            checkPrice.publishTime = _timestamp;
            checkPrice.price = priceByTimestamp[_timestamp];
        } else {
            uint256 fee = _pyth.getUpdateFee(updatePriceData);

            _pyth.updatePriceFeeds{value: fee}(updatePriceData);

            /* solhint-disable-next-line */
            bytes32 priceID = bytes32(
                //0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace
                0xca80ba6dc32e08d06f1aa886011eed1d77c77be9eb761cc10d72b7d0a2fd57a6
            );

            checkPrice = _pyth.getPriceUnsafe(priceID);
        }
    }

    function _msgSender()
        internal
        view
        override(Context, ERC2771Context)
        returns (address)
    {
        return ERC2771Context._msgSender();
    }

    function _msgData()
        internal
        view
        override(Context, ERC2771Context)
        returns (bytes calldata)
    {
        return ERC2771Context._msgData();
    }
}
