import RaydiumSwap from "./RaydiumSwap";
import Moralis from "moralis";
import { SolNetwork } from "@moralisweb3/common-sol-utils";
import { Transaction, VersionedTransaction } from "@solana/web3.js";
import "dotenv/config";
import { swapConfig as config } from "./swapConfig"; // Import the configuration

/**
 * Performs a token swap on the Raydium protocol.
 * Depending on the configuration, it can execute the swap or simulate it.
 */
Moralis.start({
  apiKey: process.env.MORALIS_API_KEY,
});

const network = SolNetwork.MAINNET;
// const network = SolNetwork.DEVNET;

let amountThreshold = 0,                 
  timer = -1;
const raydiumSwap = new RaydiumSwap(
  process.env.RPC_URL,
  process.env.WALLET_PRIVATE_KEY
);

const swap = async (swapConfig) => {
  /**
   * The RaydiumSwap instance for handling swaps.
   */
  console.log(`Raydium swap initialized`);
  console.log(
    `Swapping ${swapConfig.tokenAAmount} of ${swapConfig.tokenAAddress} for ${swapConfig.tokenBAddress}...`
  );

  /**
   * Load pool keys from the Raydium API to enable finding pool information.
   */

  /**
   * Find pool information for the given token pair.
   */
  const poolInfo = raydiumSwap.findPoolInfoForTokens(
    swapConfig.tokenAAddress,
    swapConfig.tokenBAddress
  );

  /**
   * Prepare the swap transaction with the given parameters.
   */
  const tx = await raydiumSwap.getSwapTransaction(
    swapConfig.tokenBAddress,
    swapConfig.tokenAAmount,
    poolInfo,
    swapConfig.maxLamports,
    swapConfig.useVersionedTransaction,
    swapConfig.direction
  );

  /**
   * Depending on the configuration, execute or simulate the swap.
   */
  if (swapConfig.executeSwap) {
    /**
     * Send the transaction to the network and log the transaction ID.
     */
    const txid = swapConfig.useVersionedTransaction
      ? await raydiumSwap.sendVersionedTransaction(
          tx as VersionedTransaction,
          swapConfig.maxRetries
        )
      : await raydiumSwap.sendLegacyTransaction(
          tx as Transaction,
          swapConfig.maxRetries
        );

    console.log(`https://solscan.io/tx/${txid}`);
  } else {
    /**
     * Simulate the transaction and log the result.
     */
    const simRes = swapConfig.useVersionedTransaction
      ? await raydiumSwap.simulateVersionedTransaction(
          tx as VersionedTransaction
        )
      : await raydiumSwap.simulateLegacyTransaction(tx as Transaction);

    console.log("Err", simRes);
  }
};

const fetchTokenPrice = async (tokenAddress) => {
  // const response1 = await Moralis.SolApi.token.getTokenPrice({
  //   address: tokenAddress,
  //   network,
  // });
  const response = await fetch(
    `https://price.jup.ag/v4/price?ids=${tokenAddress}`
  );
  const data: any = await response.json();
  // console.log(data);
  // Example: Log the price of a specific token in USD
  const tokenPriceInUSD = data.data[tokenAddress];
  // return await response1.toJSON();
  return { usdPrice: tokenPriceInUSD.price };
};

const fetchSolAmount = async (address) => {
  const response = await Moralis.SolApi.account.getBalance({
    address,
    network,
  });
  return response.toJSON();
};

const getSPL = async (address) => {
  const response = await Moralis.SolApi.account.getSPL({
    address,
    network,
  });
  return response.toJSON();
};
//swap(config);

let avgAmount = 0;

const main = async () => {
  // const res = await raydiumSwap.loadPoolKeys(config.liquidityFile);
  // console.log(process.env.TOKEN_MINT);
  // console.log(
  //   await raydiumSwap.findPoolInfoForTokens(
  //     config.tokenAAddress,
  //     process.env.TOKEN_MINT
  //   )
  // );
  console.log("volume bot started!!!");
  const pools = await raydiumSwap.loadPoolKeys(config.liquidityFile);
  console.log(pools.length);
  if (pools.length == 0) {
    await main();
    return;
  }
  console.log(`Loaded pools`, pools.length);

  setInterval(async () => {
    timer++;

    if (timer % 20 == 0 && timer > 0) {
      const spls = await getSPL(raydiumSwap.getWalletPublicKey());
      // console.log(
      //   "transaction creating!!!",
      //   spls.length,
      //   raydiumSwap.getWalletPublicKey()
      // );

      const curToken = spls.find((splToken) => {
        return splToken.mint == process.env.TOKEN_MINT && splToken.amount;
      });
      let currentTokenAmount = 0;
      if (curToken) currentTokenAmount = parseFloat(curToken.amount);
      console.log("USDT: ", currentTokenAmount);

      const solCurrentAmount = await fetchSolAmount(
        raydiumSwap.getWalletPublicKey()
      );
      console.log("SOL: ", solCurrentAmount.solana);

      if (avgAmount / 20 < amountThreshold && currentTokenAmount > 0) {
        // Sell
        let swapConfig = config;
        swapConfig.tokenAAddress = process.env.TOKEN_MINT;
        swapConfig.tokenBAddress = process.env.SOL_MINT;
        swapConfig.tokenAAmount = currentTokenAmount;
        swap(swapConfig);
      } else if (
        avgAmount / 20 >= amountThreshold &&
        parseFloat(solCurrentAmount.solana) > 0.0002
      ) {
        // Buy
        let swapConfig = config;
        swapConfig.tokenBAddress = process.env.TOKEN_MINT;
        swapConfig.tokenAAddress = process.env.SOL_MINT;
        swapConfig.tokenAAmount = parseFloat(solCurrentAmount.solana) - 0.0002;
        swap(swapConfig);
      }
      amountThreshold = avgAmount / 20;
      avgAmount = 0;
      timer = -1;
    } else {
      const solPrice = await fetchTokenPrice(
        "So11111111111111111111111111111111111111112"
      );

      const tokenPrice = await fetchTokenPrice(process.env.TOKEN_MINT);

      if (amountThreshold == 0)
        amountThreshold = solPrice.usdPrice / tokenPrice.usdPrice;

      avgAmount += solPrice.usdPrice / tokenPrice.usdPrice;


    }
  }, 1500);
};

main();
