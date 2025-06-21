
import {
    Connection,
    PublicKey,
    Transaction,
    SystemProgram,
} from '@solana/web3.js';
import { Buffer } from 'buffer';

/**
 * Create and prepare a transaction for signing
 */
export async function prepareTransaction(params) {
    const { senderPublicKeyString, receiverPublicKeyString, transferAmt } = params;
    try {
        // Connect to Solana network
        const connection = new Connection(
            "https://gorchain.wstf.io",
            "confirmed"
        );

        // Transaction parameters
        const senderPublicKey = new PublicKey(senderPublicKeyString);
        const receiverPublicKey = new PublicKey(receiverPublicKeyString);
        const transferAmount = transferAmt * 1000000000; // 0.0001 SOL in lamports

        console.log(`Preparing transaction to transfer 0.0001 SOL from ${senderPublicKey.toString()} to ${receiverPublicKey.toString()}`);

        // Get fresh blockhash
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("finalized");
        console.log(`Got blockhash: ${blockhash} (valid until block height: ${lastValidBlockHeight})`);

        // Get current block height to estimate time left
        const currentBlockHeight = await connection.getBlockHeight();
        const blocksRemaining = lastValidBlockHeight - currentBlockHeight;
        const estimatedTimeRemaining = blocksRemaining * 0.4; // ~0.4 seconds per block
        console.log(`Current block height: ${currentBlockHeight}, estimated time until expiration: ~${estimatedTimeRemaining.toFixed(0)} seconds`);

        // Create transfer instruction
        const transferInstruction = SystemProgram.transfer({
            fromPubkey: senderPublicKey,
            toPubkey: receiverPublicKey,
            lamports: transferAmount,
        });

        // Create a transaction and add the transfer instruction
        const transaction = new Transaction().add(transferInstruction);
        transaction.feePayer = senderPublicKey;
        transaction.recentBlockhash = blockhash;

        // Serialize the message
        const messageBytes = transaction.serializeMessage();
        const base64Message = Buffer.from(messageBytes).toString('base64');

        console.log("\n===== MESSAGE THAT NEEDS TO BE SIGNED =====");
        console.log(base64Message);
        console.log("==========================================\n");

        return {
            connection,
            blockhash,
            lastValidBlockHeight,
            base64Message,
            senderPublicKey
        };
    } catch (error) {
        console.error("Error preparing transaction:", error);
        throw error;
    }
}

/**
 * Complete the transaction using the signature
 */
export async function completeTransaction(params) {
    try {
        const { connection, base64Message, senderPublicKey, blockhash, lastValidBlockHeight, signatureHex } = params;
        // const signatureHex = await question("\nEnter the signature in hex format: ");

        // Check current block height to see if blockhash is still valid
        const currentBlockHeight = await connection.getBlockHeight();
        if (currentBlockHeight >= lastValidBlockHeight) {
            console.error(`ERROR: Blockhash has expired! Current height: ${currentBlockHeight}, Last valid height: ${lastValidBlockHeight}`);
            console.error("Please start over with a fresh blockhash.");
            return null;
        }

        console.log(`Blockhash is still valid. Current height: ${currentBlockHeight}, Last valid height: ${lastValidBlockHeight}`);
        console.log(`Time remaining: ~${((lastValidBlockHeight - currentBlockHeight) * 0.4).toFixed(0)} seconds`);

        // Convert signature to buffer
        const signatureBuffer = Buffer.from(signatureHex, "hex");
        console.log(`Signature (${signatureBuffer.length} bytes): ${signatureHex.substring(0, 20)}...`);

        // Convert message to buffer
        const messageBuffer = Buffer.from(base64Message, "base64");
        console.log(`Message (${messageBuffer.length} bytes): ${base64Message.substring(0, 20)}...`);

        // Create wire transaction format
        const wireTransaction = Buffer.concat([
            Buffer.from([1]), // 1 signature
            signatureBuffer,
            messageBuffer
        ]);

        console.log(`\nSending transaction with wire format (${wireTransaction.length} bytes)...`);

        // Send transaction
        try {
            // Method 1: Using sendRawTransaction
            console.log("Trying method 1: sendRawTransaction...");
            const txid1 = await connection.sendRawTransaction(wireTransaction, {
                skipPreflight: true,
                preflightCommitment: "confirmed"
            });
            console.log(`Transaction sent with ID: ${txid1}`);

            // Method 2: Using _rpcRequest
            console.log("Trying method 2: _rpcRequest...");
            const encodedTransaction = wireTransaction.toString("base64");
            const rpcResponse = await connection._rpcRequest("sendTransaction", [
                encodedTransaction,
                { encoding: "base64", skipPreflight: true, preflightCommitment: "confirmed" }
            ]);

            if (rpcResponse.error) {
                console.error("RPC Error:", rpcResponse.error);
            } else {
                console.log(`Transaction sent with ID: ${rpcResponse.result}`);
            }

            // Check transaction status after a short delay
            const txid = txid1 || rpcResponse.result;
            if (txid) {
                console.log(`\nWaiting 5 seconds to check transaction status...`);
                await new Promise(resolve => setTimeout(resolve, 5000));

                const status = await connection.getSignatureStatus(txid);
                console.log("Transaction status:", status);

                if (status.value === null) {
                    console.log("\nTransaction not found on network. Possible reasons:");
                    console.log("1. Blockhash expired between submission and processing");
                    console.log("2. Signature verification failed (incorrect signature)");
                    console.log("3. Insufficient funds or other runtime errors");

                    // Try to get more details
                    try {
                        const simResult = await connection.simulateTransaction(wireTransaction);
                        console.log("\nSimulation result:", simResult);
                    } catch (simError) {
                        console.log("\nSimulation error:", simError);
                    }
                } else if (status.value.err) {
                    console.log("\nTransaction error:", status.value.err);
                } else {
                    console.log("\nTransaction successful!");
                    console.log(`View on Solana Explorer: https://explorer.solana.com/tx/${txid}?cluster=devnet`);
                }
            }

            return txid;
        } catch (sendError) {
            console.error("Error sending transaction:", sendError);

            // Try simulation to get more details
            try {
                console.log("\nSimulating transaction to get more details...");
                const simResult = await connection.simulateTransaction(wireTransaction);
                console.log("Simulation result:", simResult);
            } catch (simError) {
                console.log("Simulation error:", simError);
            }

            throw sendError;
        }
    } catch (error) {
        console.error("Error completing transaction:", error);
        throw error;
    }
}

/**
 * Main function
 */
async function main() {
    try {
        const params = await prepareTransaction();
        await completeTransaction(params);
    } catch (error) {
        console.error("Error in main process:", error);
    }
}
