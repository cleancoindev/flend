const {
    BN,
    ether,
    expectRevert,
    time,
    balance,
} = require('openzeppelin-test-helpers');

const { expect } = require('chai');
const { promiseExpect } = require('chai-as-promised');
var should = require('chai').should();


const Web3 = require('web3');
var web3 = new Web3();
web3.setProvider(Web3.givenProvider || 'ws://localhost:9545')//..Web3.givenProvider);

const LiquidityPool = artifacts.require('LiquidityPool');
const TestOracle = artifacts.require('TestOracle');
const TestSFC = artifacts.require('TestSFC');
const TestToken = artifacts.require('TestToken');
const contractGasLimit = 4712388;

const sfcAddress = '0xFC00FACE00000000000000000000000000000000';
const fUSDAddress = '0xC17518AE5dAD82B8fc8b56Fe0295881c30848829';

const wallet1BeginBalance = 1000000000;

contract('liquidity pool test', async (wallets) => {
  const owner = wallets[0];

  beforeEach(async function () {
    testSFC = await TestSFC.new();
    
    nativeToken = await TestToken.new('Test', 'tst', 3);
    testToken2 = await TestToken.new('Test2', 'tst2', 3);

    testOracle = await TestOracle.new();
    testOracle.setPrice(nativeToken.address, Web3.utils.toBN('1'));
    testOracle.setPrice(testToken2.address, Web3.utils.toBN('1'));

    liquiditypool = await newLiquidityPool(nativeToken, testToken2, testOracle, testSFC);
    amt = Web3.utils.toBN('100000000000');

    let msg = {from: wallets[0]};
    await nativeToken.increaseAllowance(liquiditypool.address, amt, msg);
    await nativeToken.increaseAllowance(wallets[1], amt, msg);
    await nativeToken.increaseAllowance(wallets[0], amt, msg);
    await testToken2.increaseAllowance(liquiditypool.address, amt, msg);
    await testToken2.increaseAllowance(wallets[0], amt, msg);
    await testToken2.increaseAllowance(wallets[1], amt, msg);
    msg = {from: wallets[1]};
    await nativeToken.increaseAllowance(liquiditypool.address, amt, msg);
    await nativeToken.increaseAllowance(wallets[0], amt, msg);
    await nativeToken.increaseAllowance(wallets[1], amt, msg);
    await testToken2.increaseAllowance(liquiditypool.address, amt, msg);
    await testToken2.increaseAllowance(wallets[0], amt, msg);
    await testToken2.increaseAllowance(wallets[1], amt, msg);
  });

  it('checking pool parameters', checkPoolParams);
  it('test success deposit no reward', async () => {
    await checkSuccessDepositNoReward(wallets)
  });
  it('test success deposit with reward', async () => {
    await checkSuccessDepositWithReward(wallets)
  });
  it('test failed deposits', async () => {
    await checkFailedDeposits(wallets)
  });
  it('test success deposit info', async () => {
    await checkSuccessDepositInfo()
  });
  it('test success withdraw no limit no fee', async () => {
    await checkSuccessWithdrawNoLimitNoFee(wallets)
  });
  it('test success withdraw with limit no fee', async () => {
    await checkWithdrawWithLimitNoFee(wallets)
  });
  it('test success withdraw no limit with fee', async () => {
    await checkSuccessWithdrawNoLimitWithFee(wallets)
  });
  it('test failed withdraw with limit with fee', async () => {
    await checkFailedWithdrawWithLimitWithFee(wallets)
  });
  it('test success withdraw info', async () => {
    await checkSuccessWithdrawInfo(wallets)
  });
  it('test epoch rewards calc 1/1000 for balance 1000', async () => {
    await checkEpochRewardCalc1000_100_1000_0_0(wallets)
  });
  it('test epoch rewards calc 1/10 for balance 1000', async () => {
    await checkEpochRewardCalc1000_100_10_0_0(wallets)
  });
  it('test epoch rewards calc 1/1000 for balance 100 with min limit 1', async () => {
    await checkEpochRewardCalc100_100_1000_1_0(wallets)
  });
  it('test epoch rewards calc 1/100 for balance 1000 with max limit 1', async () => {
    await checkEpochRewardCalc1000_100_100_0_1(wallets)
  });
});

tryCatch = async function(promise, errType) {
  try {
    await promise;
    throw null;
  }
  catch (error) {
    assert(error, "Expected an error but did not get one");
    // assert(error.message.startsWith(PREFIX + errType), "Expected an error starting with '" + PREFIX + errType + "' but got '" + error.message + "' instead");
  }
};

async function newLiquidityPool(nativeToken, fusd, testOracle, testSFC) {
  liquiditypool = await LiquidityPool.new(nativeToken.address, fusd.address, testOracle.address, testSFC.address);
    if (liquiditypool.constructor._json.deployedBytecode.length >= contractGasLimit)
      throw "gas limit exceeded"
  return liquiditypool
}

async function checkPoolParams() {
  const resReward = await liquiditypool.getReward()
  const {0: rewardNum, 1: rewardDenom, 2: epochRewardNum, 3: epochRewardDenom, 4: epochRewardMin, 5: epochRewardMax} = resReward;
  assert.equal(Web3.utils.toDecimal(rewardNum), 0, "correct init rewardNum value");
  assert.equal(Web3.utils.toDecimal(rewardDenom), 1, "correct init rewardDenom value");
  assert.equal(Web3.utils.toDecimal(epochRewardNum), 0, "correct init epochRewardNum value");
  assert.equal(Web3.utils.toDecimal(epochRewardDenom), 1, "correct init epochRewardDenom value");
  assert.equal(Web3.utils.toDecimal(epochRewardMin), 0, "correct init rewardMin value");
  assert.equal(Web3.utils.toDecimal(epochRewardMax), 0, "correct init rewardMax value");

  const resFee = await liquiditypool.getFee()
  const {0: feeNum, 1: feeDenom} = resFee;
  assert.equal(Web3.utils.toDecimal(feeNum), 0, "correct init feeNum value");
  assert.equal(Web3.utils.toDecimal(feeDenom), 1, "correct init feeDenom value");

  const resLimit = await liquiditypool.getLimit()
  const {0: limitNum, 1: limitDenom} = resLimit;
  assert.equal(Web3.utils.toDecimal(limitNum), 1, "correct init limitNum value");
  assert.equal(Web3.utils.toDecimal(limitDenom), 1, "correct init limitDenom value");
}

async function checkSuccessDepositNoReward(wallets) {
  await nativeToken.transferFrom(wallets[0], wallets[1], wallet1BeginBalance);

  let nonZeroAmt = Web3.utils.toBN('100');

  let msg = {from: wallets[1]};
  var res = await liquiditypool.deposit(nonZeroAmt, msg);
  assert.isNotNull(res.receipt, "good transaction receipt");

  assert.equal(Web3.utils.toDecimal(await nativeToken.balanceOf(wallets[1])),
      Web3.utils.toDecimal(wallet1BeginBalance) - Web3.utils.toDecimal(nonZeroAmt),
      "change native token balance at right value");
  assert.equal(Web3.utils.toDecimal(await testToken2.balanceOf(wallets[1])),
      Web3.utils.toDecimal(nonZeroAmt),
      "change fUSD token balance at right value");
}

async function checkSuccessDepositWithReward(wallets) {
  await nativeToken.transferFrom(wallets[0], wallets[1], wallet1BeginBalance);

  let nonZeroAmt = Web3.utils.toBN('100');

  // With reward
  await liquiditypool.setReward(1, 100, 0, 1, 0, 0);

  let msg = {from: wallets[1]};
  var res = await liquiditypool.deposit(nonZeroAmt, msg);
  assert.isNotNull(res.receipt, "good transaction receipt");

  assert.equal(Web3.utils.toDecimal(await nativeToken.balanceOf(wallets[1])),
      Web3.utils.toDecimal(wallet1BeginBalance) - Web3.utils.toDecimal(nonZeroAmt),
      "change native token balance at right value");
  assert.equal(Web3.utils.toDecimal(await testToken2.balanceOf(wallets[1])),
      Web3.utils.toDecimal(nonZeroAmt) + 1,
      "change fUSD token balance at right value");
}

async function checkFailedDeposits(wallets) {
  let nonZeroAmt = Web3.utils.toBN('100');

  // No balance
  let msg = {from: wallets[1]};
  await tryCatch(liquiditypool.deposit(nonZeroAmt, msg), 'VM Exception while processing transaction: revert');

  assert.equal(Web3.utils.toDecimal(await nativeToken.balanceOf(wallets[1])),
      0, "empty native token balance");
  assert.equal(Web3.utils.toDecimal(await testToken2.balanceOf(wallets[1])),
      0, "empty fUSD token balance");

  // Zero amt
  let zeroAmt = Web3.utils.toBN('0');

  await tryCatch(liquiditypool.deposit(zeroAmt, msg), 'VM Exception while processing transaction: revert');

  assert.equal(Web3.utils.toDecimal(await nativeToken.balanceOf(wallets[1])),
      0, "empty native token balance");
  assert.equal(Web3.utils.toDecimal(await testToken2.balanceOf(wallets[1])),
      0, "empty fUSD token balance");
}

async function checkSuccessDepositInfo() {
  let nonZeroAmt = Web3.utils.toBN('100');

  var depositInfo = await liquiditypool.depositInfo(nonZeroAmt);
  var {0: amount_fUSD, 1: reward_fUSD} = depositInfo;
  assert.equal(Web3.utils.toDecimal(amount_fUSD), Web3.utils.toDecimal(nonZeroAmt), "correct amount from depositInfo");
  assert.equal(Web3.utils.toDecimal(reward_fUSD), 0, "correct reward from depositInfo");

  await liquiditypool.setReward(1, 100, 0, 1, 0, 0);

  depositInfo = await liquiditypool.depositInfo(nonZeroAmt);
  var {0: amount_fUSDr100, 1: reward_fUSDr100} = depositInfo;
  assert.equal(Web3.utils.toDecimal(amount_fUSDr100), Web3.utils.toDecimal(nonZeroAmt), "correct amount from depositInfo");
  assert.equal(Web3.utils.toDecimal(reward_fUSDr100), 1, "correct reward from depositInfo");

  await liquiditypool.setReward(1, 50, 0, 1, 0, 0);

  depositInfo = await liquiditypool.depositInfo(nonZeroAmt);
  var {0: amount_fUSDr50, 1: reward_fUSDr50} = depositInfo;
  assert.equal(Web3.utils.toDecimal(amount_fUSDr50), Web3.utils.toDecimal(nonZeroAmt), "correct amount from depositInfo");
  assert.equal(Web3.utils.toDecimal(reward_fUSDr50), 2, "correct reward from depositInfo");

  await liquiditypool.setReward(1, 20, 0, 1, 0, 0);

  depositInfo = await liquiditypool.depositInfo(nonZeroAmt);
  var {0: amount_fUSDr20, 1: reward_fUSDr20} = depositInfo;
  assert.equal(Web3.utils.toDecimal(amount_fUSDr20), Web3.utils.toDecimal(nonZeroAmt), "correct amount from depositInfo");
  assert.equal(Web3.utils.toDecimal(reward_fUSDr20), 5, "correct reward from depositInfo");

  await liquiditypool.setReward(1, 10, 0, 1, 0, 0);

  depositInfo = await liquiditypool.depositInfo(nonZeroAmt);
  var {0: amount_fUSDr10, 1: reward_fUSDr10} = depositInfo;
  assert.equal(Web3.utils.toDecimal(amount_fUSDr10), Web3.utils.toDecimal(nonZeroAmt), "correct amount from depositInfo");
  assert.equal(Web3.utils.toDecimal(reward_fUSDr10), 10, "correct reward from depositInfo");
}

async function checkSuccessWithdrawNoLimitNoFee(wallets) {
  await nativeToken.transferFrom(wallets[0], wallets[1], wallet1BeginBalance);
  await testToken2.transferFrom(wallets[0], wallets[1], wallet1BeginBalance);

  let nonZeroAmt = Web3.utils.toBN('100');

  let msg = {from: wallets[1]};
  var res = await liquiditypool.withdraw(nonZeroAmt, msg);
  assert.isNotNull(res.receipt, "good transaction receipt");

  assert.equal(Web3.utils.toDecimal(await nativeToken.balanceOf(wallets[1])),
      Web3.utils.toDecimal(wallet1BeginBalance) + Web3.utils.toDecimal(nonZeroAmt),
      "change native token balance at right value");
  assert.equal(Web3.utils.toDecimal(await testToken2.balanceOf(wallets[1])),
      Web3.utils.toDecimal(wallet1BeginBalance) - Web3.utils.toDecimal(nonZeroAmt),
      "change fUSD token balance at right value");
}

async function checkWithdrawWithLimitNoFee(wallets) {
  await nativeToken.transferFrom(wallets[0], wallets[1], wallet1BeginBalance);
  await testToken2.transferFrom(wallets[0], wallets[1], wallet1BeginBalance);

  await liquiditypool.setLimit(1, 2);

  let nonZeroAmt = wallet1BeginBalance / 2;

  let msg = {from: wallets[1]};
  var res = await liquiditypool.withdraw(nonZeroAmt, msg);
  assert.isNotNull(res.receipt, "good transaction receipt");

  assert.equal(Web3.utils.toDecimal(await nativeToken.balanceOf(wallets[1])),
      Web3.utils.toDecimal(wallet1BeginBalance) + Web3.utils.toDecimal(nonZeroAmt),
      "change native token balance at right value");
  assert.equal(Web3.utils.toDecimal(await testToken2.balanceOf(wallets[1])),
      Web3.utils.toDecimal(wallet1BeginBalance) - Web3.utils.toDecimal(nonZeroAmt),
      "change fUSD token balance at right value");

  // Limit exceed
  nonZeroAmt = wallet1BeginBalance;

  var prevNativeBalance = await nativeToken.balanceOf(wallets[1]);
  var prevfUSDBalance = await testToken2.balanceOf(wallets[1]);

  await tryCatch(liquiditypool.withdraw(nonZeroAmt, msg), 'VM Exception while processing transaction: revert');

  assert.equal(Web3.utils.toDecimal(await nativeToken.balanceOf(wallets[1])),
      Web3.utils.toDecimal(prevNativeBalance), "no change native token balance");
  assert.equal(Web3.utils.toDecimal(await testToken2.balanceOf(wallets[1])),
      Web3.utils.toDecimal(prevfUSDBalance), "no change fUSD token balance");
}

async function checkSuccessWithdrawNoLimitWithFee(wallets) {
  await nativeToken.transferFrom(wallets[0], wallets[1], wallet1BeginBalance);
  await testToken2.transferFrom(wallets[0], wallets[1], wallet1BeginBalance);

  await liquiditypool.setFee(1, 2);

  let nonZeroAmt = Web3.utils.toBN('100');

  let msg = {from: wallets[1]};
  var res = await liquiditypool.withdraw(nonZeroAmt, msg);
  assert.isNotNull(res.receipt, "good transaction receipt");

  assert.equal(Web3.utils.toDecimal(await nativeToken.balanceOf(wallets[1])),
      Web3.utils.toDecimal(wallet1BeginBalance) + Web3.utils.toDecimal(nonZeroAmt),
      "change native token balance at right value");
  assert.equal(Web3.utils.toDecimal(await testToken2.balanceOf(wallets[1])),
      Web3.utils.toDecimal(wallet1BeginBalance) - Web3.utils.toDecimal(nonZeroAmt) * 1.5,
      "change fUSD token balance at right value");
}

async function checkFailedWithdrawWithLimitWithFee(wallets) {
  await nativeToken.transferFrom(wallets[0], wallets[1], wallet1BeginBalance);
  await testToken2.transferFrom(wallets[0], wallets[1], wallet1BeginBalance);

  await liquiditypool.setFee(1, 2);
  await liquiditypool.setLimit(1, 2);

  let nonZeroAmt = wallet1BeginBalance / 2;
  let msg = {from: wallets[1]};

  await tryCatch(liquiditypool.withdraw(nonZeroAmt, msg),
      'revert out of limits for fUSD tokens getting');

  assert.equal(Web3.utils.toDecimal(await nativeToken.balanceOf(wallets[1])),
      Web3.utils.toDecimal(wallet1BeginBalance), "no change native token balance");
  assert.equal(Web3.utils.toDecimal(await testToken2.balanceOf(wallets[1])),
      Web3.utils.toDecimal(wallet1BeginBalance), "no change fUSD token balance");
}

async function checkSuccessWithdrawInfo(wallets) {
  await testToken2.transferFrom(wallets[0], wallets[1], wallet1BeginBalance);

  let nonZeroAmt = Web3.utils.toBN('100');
  let msg = {from: wallets[1]};
  var wallet1Balance = await testToken2.balanceOf(wallets[1])

  var withdrawInfo = await liquiditypool.withdrawInfo(nonZeroAmt, msg);
  var {0: amount_fUSD, 1: fee_fUSD, 2: limit_fUSD} = withdrawInfo;
  assert.equal(Web3.utils.toDecimal(amount_fUSD), Web3.utils.toDecimal(nonZeroAmt), "correct amount from withdrawInfo");
  assert.equal(Web3.utils.toDecimal(fee_fUSD), 0, "correct fee from withdrawInfo");
  assert.equal(Web3.utils.toDecimal(limit_fUSD), Web3.utils.toDecimal(wallet1Balance), "correct limit from withdrawInfo");

  await liquiditypool.setFee(1, 2);

  withdrawInfo = await liquiditypool.withdrawInfo(nonZeroAmt, msg);
  var {0: amount_fUSDf2, 1: fee_fUSDf2, 2: limit_fUSDf2} = withdrawInfo;
  assert.equal(Web3.utils.toDecimal(amount_fUSDf2), Web3.utils.toDecimal(nonZeroAmt), "correct amount from withdrawInfo");
  assert.equal(Web3.utils.toDecimal(fee_fUSDf2), Web3.utils.toDecimal(nonZeroAmt) / 2, "correct fee from withdrawInfo");
  assert.equal(Web3.utils.toDecimal(limit_fUSDf2), Web3.utils.toDecimal(wallet1Balance), "correct limit from withdrawInfo");

  await liquiditypool.setFee(1, 2);
  await liquiditypool.setLimit(1, 2);

  nonZeroAmt = wallet1Balance / 4 + 2;
  withdrawInfo = await liquiditypool.withdrawInfo(nonZeroAmt, msg);
  var {0: amount_fUSDf2l2, 1: fee_fUSDf2l2, 2: limit_fUSDf2l2} = withdrawInfo;
  assert.equal(Web3.utils.toDecimal(amount_fUSDf2l2), Web3.utils.toDecimal(nonZeroAmt), "correct amount from withdrawInfo");
  assert.equal(Web3.utils.toDecimal(fee_fUSDf2l2), Web3.utils.toDecimal(nonZeroAmt) / 2, "correct fee from withdrawInfo");
  assert.equal(Web3.utils.toDecimal(limit_fUSDf2l2), Web3.utils.toDecimal(wallet1Balance) / 2, "correct limit from withdrawInfo");
}

async function checkEpochRewardCalc1000_100_1000_0_0(wallets) {
  // Init state
  await nativeToken.transferFrom(wallets[0], wallets[1], wallet1BeginBalance);
  await testSFC.setCurrentEpoch(0)

  let nonZeroAmt = Web3.utils.toBN('1000');

  let msg = {from: wallets[1]};
  var res = await liquiditypool.deposit(nonZeroAmt, msg);
  assert.isNotNull(res.receipt, "good transaction receipt");

  /*
    Set epoch reward values 1/1000 without limits
  */
  await liquiditypool.setReward(1, 100, 1, 1000, 0, 0);

  // Check for 1 epoch

  await testSFC.setCurrentEpoch(1);

  await liquiditypool.applyRewardsAll();

  withReward = Web3.utils.toDecimal(await testToken2.balanceOf(wallets[1]));
  assert.equal(Web3.utils.toDecimal(withReward), 1001, "correct fUSD balance after apply epoch reward");

  await liquiditypool.withdraw(1, msg);

  // After 10 epochs
  await testSFC.setCurrentEpoch(11);

  await liquiditypool.applyRewardsAll();

  withReward = Web3.utils.toDecimal(await testToken2.balanceOf(wallets[1]));
  assert.equal(Web3.utils.toDecimal(withReward), 1010, "correct fUSD balance after apply epoch reward");

  await liquiditypool.withdraw(10, msg);

  // After 100 epochs
  beginBalance = Web3.utils.toDecimal(await testToken2.balanceOf(wallets[1]));

  await testSFC.setCurrentEpoch(111);

  await liquiditypool.applyRewardsAll();

  withReward = Web3.utils.toDecimal(await testToken2.balanceOf(wallets[1]));
  assert.equal(Web3.utils.toDecimal(withReward), 1100, "correct fUSD balance after apply epoch reward");
}

async function checkEpochRewardCalc1000_100_10_0_0(wallets) {
  // Init state
  await nativeToken.transferFrom(wallets[0], wallets[1], wallet1BeginBalance);
  await testSFC.setCurrentEpoch(0)

  let nonZeroAmt = Web3.utils.toBN('1000');

  let msg = {from: wallets[1]};
  var res = await liquiditypool.deposit(nonZeroAmt, msg);
  assert.isNotNull(res.receipt, "good transaction receipt");

  /*
     Set epoch reward values 1/10 without limits
   */
  await liquiditypool.setReward(1, 100, 1, 10, 0, 0);

  // Check for 1 epoch

  await testSFC.setCurrentEpoch(1);

  await liquiditypool.applyRewardsAll();

  withReward = Web3.utils.toDecimal(await testToken2.balanceOf(wallets[1]));
  assert.equal(Web3.utils.toDecimal(withReward), 1100, "correct fUSD balance after apply epoch reward");

  await liquiditypool.withdraw(100, msg);

  // After 3 epochs
  await testSFC.setCurrentEpoch(4);

  await liquiditypool.applyRewardsAll();

  withReward = Web3.utils.toDecimal(await testToken2.balanceOf(wallets[1]));
  assert.equal(Web3.utils.toDecimal(withReward), 1331, "correct fUSD balance after apply epoch reward");

  await liquiditypool.withdraw(331, msg);

  // After 10 epochs
  await testSFC.setCurrentEpoch(14);

  await liquiditypool.applyRewardsAll();

  withReward = Web3.utils.toDecimal(await testToken2.balanceOf(wallets[1]));
  assert.equal(Web3.utils.toDecimal(withReward), 2591, "correct fUSD balance after apply epoch reward");
}

async function checkEpochRewardCalc100_100_1000_1_0(wallets) {
  // Init state
  await nativeToken.transferFrom(wallets[0], wallets[1], wallet1BeginBalance);
  await testSFC.setCurrentEpoch(0)

  let nonZeroAmt = Web3.utils.toBN('100');

  let msg = {from: wallets[1]};
  var res = await liquiditypool.deposit(nonZeroAmt, msg);
  assert.isNotNull(res.receipt, "good transaction receipt");

  /*
    With Min limit (balance = 100, epoch rate = 1/1000, min limit = 1)
  */

  await liquiditypool.setReward(1, 100, 1, 1000, 1, 0);

  // Check for 1 epoch

  await testSFC.setCurrentEpoch(1);

  await liquiditypool.applyRewardsAll();

  withReward = Web3.utils.toDecimal(await testToken2.balanceOf(wallets[1]));
  assert.equal(Web3.utils.toDecimal(withReward), 101, "correct fUSD balance after apply epoch reward");

  await liquiditypool.withdraw(1, msg);

  // After 10 epochs
  await testSFC.setCurrentEpoch(11);

  await liquiditypool.applyRewardsAll();

  withReward = Web3.utils.toDecimal(await testToken2.balanceOf(wallets[1]));
  assert.equal(Web3.utils.toDecimal(withReward), 110, "correct fUSD balance after apply epoch reward");

  await liquiditypool.withdraw(10, msg);

  // After 100 epochs
  beginBalance = Web3.utils.toDecimal(await testToken2.balanceOf(wallets[1]));

  await testSFC.setCurrentEpoch(111);

  await liquiditypool.applyRewardsAll();

  withReward = Web3.utils.toDecimal(await testToken2.balanceOf(wallets[1]));
  assert.equal(Web3.utils.toDecimal(withReward), 200, "correct fUSD balance after apply epoch reward");
}

async function checkEpochRewardCalc1000_100_100_0_1(wallets) {
  // Init state
  await nativeToken.transferFrom(wallets[0], wallets[1], wallet1BeginBalance);
  await testSFC.setCurrentEpoch(0)

  let nonZeroAmt = Web3.utils.toBN('1000');

  let msg = {from: wallets[1]};
  var res = await liquiditypool.deposit(nonZeroAmt, msg);
  assert.isNotNull(res.receipt, "good transaction receipt");

  /*
    With Max limit (balance = 1000, epoch rate = 1/100, min limit = 0, max limit = 1)
  */
  
  await liquiditypool.setReward(1, 100, 1, 100, 0, 1);

  // Check for 1 epoch

  await testSFC.setCurrentEpoch(1);

  await liquiditypool.applyRewardsAll();

  withReward = Web3.utils.toDecimal(await testToken2.balanceOf(wallets[1]));
  assert.equal(Web3.utils.toDecimal(withReward), 1001, "correct fUSD balance after apply epoch reward");

  await liquiditypool.withdraw(1, msg);

  // After 10 epochs
  await testSFC.setCurrentEpoch(11);

  await liquiditypool.applyRewardsAll();

  withReward = Web3.utils.toDecimal(await testToken2.balanceOf(wallets[1]));
  assert.equal(Web3.utils.toDecimal(withReward), 1010, "correct fUSD balance after apply epoch reward");

  await liquiditypool.withdraw(10, msg);

  // After 100 epochs
  beginBalance = Web3.utils.toDecimal(await testToken2.balanceOf(wallets[1]));

  await testSFC.setCurrentEpoch(111);

  await liquiditypool.applyRewardsAll();

  withReward = Web3.utils.toDecimal(await testToken2.balanceOf(wallets[1]));
  assert.equal(Web3.utils.toDecimal(withReward), 1100, "correct fUSD balance after apply epoch reward");
}