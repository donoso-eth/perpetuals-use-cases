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
        address user;
        uint256 timestamp;
        uint256 amount;
        int64 price;
        uint256 publishTime;
        bool above;
        uint256 leverage;
        int64 priceSettled;
        int64 tokens;
        bool active;
    }

    IPyth private _pyth;
    mapping(uint256 => int64) priceByTimestamp;

    // Order Settlement
    uint256 public orderId;
    mapping(uint256 => Order) public ordersByOrderId;
    mapping(address => uint256[]) public ordersByUser;
    mapping(address => uint256) public nrOrdersByUser;
    event setOrderEvent(uint256 timestamp, uint256 orderId);
    event settleOrderEvent(address user, uint256 orderId);

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
    event executeConditionalOrder(address user, uint256 orderId);

    // Margin Trading
    uint256 public marginTradeId;
    mapping(uint256 => Order) public marginTradesByOrderId;
    mapping(address => uint256) public marginTradeIdByUser;
    event marginTradeEvent(
        uint256 timestamp,
        uint256 orderId,
        uint256 amount,
        uint256 leverage,
        int64 price,
        int64 tokens
    );
    event updateCollateralEvent(uint256 orderId, uint256 amount, bool add);
    event executeLiquidateOrder(address user, uint256 orderId);

    address public immutable gelatoMsgSender;

    modifier onlyGelatoMsgSender() {
        require(
            msg.sender == gelatoMsgSender,
            "Only dedicated gelato msg.sender"
        );
        _;
    }

    constructor(
        address _gelatoMsgSender,
        address pythContract,
        address _trustedForwarder
    ) ERC2771Context(_trustedForwarder) {
        gelatoMsgSender = _gelatoMsgSender;
        _pyth = IPyth(pythContract);
    }

    /* solhint-disable-next-line no-empty-blocks */
    receive() external payable {}

    // #region ============ ===============  Settle Order Implementation ============= ============= //
    function setOrder(uint256 _amount) external {
        orderId += 1;
        ordersByOrderId[orderId] = Order(
            msg.sender,
            block.timestamp,
            _amount,
            0,
            0,
            true,
            0,
            0,
            0,
            true
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
            order.priceSettled = checkPrice.price;
            order.publishTime = checkPrice.publishTime;
            order.active = false;
            emit settleOrderEvent(order.user, _orders[i]);
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
            msg.sender,
            block.timestamp,
            _amount,
            _price,
            0,
            _above,
            0,
            0,
            0,
            true
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
            conditionalOrder.priceSettled = checkPrice.price;
            conditionalOrder.publishTime = checkPrice.publishTime;
            conditionalOrder.active = false;
            emit executeConditionalOrder(
                conditionalOrder.user,
                _conditionalOrders[i]
            );
        }
    }

    // #endregion ============ =============== ============= ============= ===============  ===============  //

    // #region ============ ===============  Liquidations Implementation ============= ============= //

    function marginTrade(uint256 _leverage, uint256 _amount, int64 _price) external {
        require(_amount > 0, "Amount Positive");
        require(_leverage > 0, "Leverage Positive");
        require(_price > 0, "Price Positive");
        require(  marginTradesByOrderId[marginTradeIdByUser[_msgSender()]].active == false, "Already in a trade");
        marginTradeId += 1;
        int64  tokens =  ((int64(uint64(_amount))*(10**12))/(_price)) ;
        marginTradesByOrderId[marginTradeId] = Order(
            msg.sender,
            block.timestamp,
            _amount,
            _price,
            0,
            false,
            _leverage,
            0,
           tokens,
           true
        );
        marginTradeIdByUser[_msgSender()] = marginTradeId;

        emit marginTradeEvent(
            block.timestamp,
            marginTradeId,
            _amount,
            _leverage,
            _price,
            tokens
        );
    }

    function updateCollateral(
        uint256 _orderId,
        uint256 _amount,
        bool _add
    ) external {
        require(
            marginTradesByOrderId[_orderId].leverage != 0,
            "No Margin Trade"
        );
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
        uint256 _timestamp,
        int64 _priceSettled
    ) external onlyGelatoMsgSender {
        for (uint256 i = 0; i < _tradesLiquidated.length; i++) {
            Order storage liquidateTrade = marginTradesByOrderId[
                _tradesLiquidated[i]
            ];
            liquidateTrade.priceSettled = _priceSettled;
            liquidateTrade.publishTime = _timestamp;
            liquidateTrade.active = false;

            emit executeLiquidateOrder(
                liquidateTrade.user,
                _tradesLiquidated[i]
            );
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

    function getMarginTrade(uint256 _order) public view returns (Order memory) {
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
