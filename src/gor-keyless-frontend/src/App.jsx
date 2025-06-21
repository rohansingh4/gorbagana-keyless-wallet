import { useState, useEffect } from 'react';
import { AuthClient } from '@dfinity/auth-client';
import { HttpAgent, Actor } from '@dfinity/agent';
import { gor_keyless_backend } from 'declarations/gor-keyless-backend';
import { idlFactory } from 'declarations/gor-keyless-backend/gor-keyless-backend.did.js';
import './App.css';

function App() {
  const [authClient, setAuthClient] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [identity, setIdentity] = useState(null);
  const [principal, setPrincipal] = useState('');
  const [walletAddress, setWalletAddress] = useState('');
  const [balance, setBalance] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [authenticatedBackend, setAuthenticatedBackend] = useState(null);
  
  // Transaction form states
  const [toAddress, setToAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [txResult, setTxResult] = useState(null);

  useEffect(() => {
    initAuth();
  }, []);

  const initAuth = async () => {
    const client = await AuthClient.create();
    setAuthClient(client);

    if (await client.isAuthenticated()) {
      handleAuthenticated(client);
    }
  };

  const handleAuthenticated = async (client) => {
    const identity = client.getIdentity();
    setIdentity(identity);
    setIsAuthenticated(true);
    const principalStr = identity.getPrincipal().toString();
    setPrincipal(principalStr);

    try {
      // Create authenticated agent
      const agent = new HttpAgent({
        identity,
        host: process.env.DFX_NETWORK === "local" ? "http://localhost:4943" : "https://ic0.app",
      });

      // Fetch network root key for local development
      if (process.env.DFX_NETWORK === "local") {
        await agent.fetchRootKey();
      }

      // Create authenticated backend actor
      const canisterId = process.env.CANISTER_ID_GOR_KEYLESS_BACKEND || "u6s2n-gx777-77774-qaaba-cai";
      const backend = Actor.createActor(idlFactory, {
        agent,
        canisterId,
      });

      setAuthenticatedBackend(backend);

      // Check if user already has a wallet stored locally
      const storedWallet = localStorage.getItem(`wallet_${principalStr}`);
      if (storedWallet) {
        console.log("Found existing wallet for user:", storedWallet);
        setWalletAddress(storedWallet);
        await fetchBalance(storedWallet, backend);
      } else {
        // Generate new wallet for first-time user
        await generateWallet(backend);
      }
    } catch (err) {
      console.error("Authentication setup failed:", err);
      setError("Failed to set up authenticated connection: " + err.message);
    }
  };

  const login = async () => {
    setLoading(true);
    setError('');
    try {
      await authClient.login({
        identityProvider: process.env.DFX_NETWORK === "local" 
          ? `http://rdmx6-jaaaa-aaaaa-aaadq-cai.localhost:4943/` 
          : "https://identity.ic0.app",
        onSuccess: () => {
          handleAuthenticated(authClient);
        },
      });
    } catch (err) {
      setError('Login failed: ' + err.message);
    }
    setLoading(false);
  };

  const logout = async () => {
    await authClient.logout();
    setIsAuthenticated(false);
    setIdentity(null);
    setPrincipal('');
    setWalletAddress('');
    setBalance(null);
    setError('');
    setTxResult(null);
    setAuthenticatedBackend(null);
  };

  const generateWallet = async (backend = authenticatedBackend) => {
    if (!backend) {
      setError('Backend not available. Please try signing in again.');
      return;
    }

    setLoading(true);
    setError('');
    console.log("Generating wallet for principal:", principal);
    
    try {
      const result = await backend.generate_keypair_solana();
      console.log("Generate wallet result:", result);
      
      if ('Ok' in result) {
        const walletAddr = result.Ok;
        setWalletAddress(walletAddr);
        
        // Store wallet address locally for this user
        localStorage.setItem(`wallet_${principal}`, walletAddr);
        console.log("Wallet generated and stored:", walletAddr);
        
        await fetchBalance(walletAddr, backend);
      } else {
        setError('Failed to generate wallet: ' + result.Err);
        console.error("Generate wallet error:", result.Err);
      }
    } catch (err) {
      console.error('Error generating wallet:', err);
      setError('Error generating wallet: ' + err.message);
    }
    setLoading(false);
  };

  const fetchBalance = async (address = walletAddress, backend = authenticatedBackend) => {
    if (!address || !backend) return;
    
    setLoading(true);
    console.log("Fetching balance for address:", address);
    
    try {
      const result = await backend.fetch_balance(address);
      console.log("Balance result:", result);
      
      if ('Ok' in result) {
        setBalance(result.Ok);
        console.log("Balance fetched:", result.Ok);
      } else {
        setError('Failed to fetch balance: ' + result.Err);
        console.error("Balance fetch error:", result.Err);
      }
    } catch (err) {
      console.error('Error fetching balance:', err);
      setError('Error fetching balance: ' + err.message);
    }
    setLoading(false);
  };

  const sendTransaction = async (e) => {
    e.preventDefault();
    if (!toAddress || !amount || !authenticatedBackend) return;

    setLoading(true);
    setError('');
    setTxResult(null);

    try {
      const amountLamports = Math.floor(parseFloat(amount) * 1_000_000_000); // Convert GOR to lamports
      console.log("Creating transaction:", { toAddress, amount, amountLamports });
      
      const result = await authenticatedBackend.create_and_sign_transaction({
        to_address: toAddress,
        amount_lamports: amountLamports,
      });

      console.log("Transaction result:", result);

      if ('Ok' in result) {
        setTxResult(result.Ok);
        setToAddress('');
        setAmount('');
        // Refresh balance after transaction
        await fetchBalance();
      } else {
        setError('Transaction failed: ' + result.Err);
        console.error("Transaction error:", result.Err);
      }
    } catch (err) {
      console.error('Error creating transaction:', err);
      setError('Error creating transaction: ' + err.message);
    }
    setLoading(false);
  };

  if (!authClient) {
    return <div className="loading">Initializing...</div>;
  }

  return (
    <div className="app">
      <header className="app-header">
        <img src="/logo2.svg" alt="GOR Logo" className="logo" />
        <h1>GOR Keyless Wallet</h1>
        <p>Secure, passwordless blockchain wallet using Internet Identity</p>
      </header>

      {!isAuthenticated ? (
        <div className="auth-section">
          <h2>Sign in to access your wallet</h2>
          <p>Use your passkey, Face ID, Touch ID, or YubiKey to sign in securely</p>
          <button 
            onClick={login} 
            disabled={loading}
            className="login-button"
          >
            {loading ? 'Connecting...' : 'Sign in with Internet Identity'}
          </button>
        </div>
      ) : (
        <div className="wallet-section">
          <div className="user-info">
            <h3>Welcome!</h3>
            <p><strong>Principal:</strong> {principal}</p>
            <p><strong>Wallet Address:</strong> {walletAddress || 'Generating...'}</p>
            <button onClick={logout} className="logout-button">Sign out</button>
          </div>

          {balance && (
            <div className="balance-section">
              <h3>Balance</h3>
              <div className="balance-display">
                <span className="balance-amount">{balance.balance_gor.toFixed(4)} GOR</span>
                <span className="balance-lamports">({balance.balance_lamports} lamports)</span>
              </div>
                             <button onClick={() => fetchBalance()} disabled={loading}>
                {loading ? 'Refreshing...' : 'Refresh Balance'}
              </button>
              {!walletAddress && (
                <button onClick={() => generateWallet()} disabled={loading} style={{marginLeft: '10px'}}>
                  {loading ? 'Generating...' : 'Generate Wallet'}
                </button>
              )}
            </div>
          )}

          <div className="transaction-section">
            <h3>Send GOR</h3>
            <form onSubmit={sendTransaction} className="transaction-form">
              <div className="form-group">
                <label htmlFor="toAddress">To Address:</label>
                <input
                  id="toAddress"
                  type="text"
                  value={toAddress}
                  onChange={(e) => setToAddress(e.target.value)}
                  placeholder="Enter recipient address"
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="amount">Amount (GOR):</label>
                <input
                  id="amount"
                  type="number"
                  step="0.000000001"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.0"
                  required
                />
              </div>
              <button type="submit" disabled={loading || !toAddress || !amount}>
                {loading ? 'Signing Transaction...' : 'Send Transaction'}
              </button>
            </form>
          </div>

          {txResult && (
            <div className="transaction-result">
              <h3>Transaction Signed ✅</h3>
              <div className="tx-details">
                <p><strong>From:</strong> {txResult.from_address}</p>
                <p><strong>To:</strong> {txResult.to_address}</p>
                <p><strong>Amount:</strong> {(txResult.amount_lamports / 1_000_000_000).toFixed(4)} GOR</p>
                <p><strong>Signature:</strong> <code>{txResult.signature_hex.substring(0, 32)}...</code></p>
                <details>
                  <summary>View Transaction Data</summary>
                  <pre>{JSON.stringify(txResult, null, 2)}</pre>
                </details>
              </div>
            </div>
          )}

          {error && (
            <div className="error-message">
              <p>❌ {error}</p>
              <button onClick={() => setError('')}>Dismiss</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default App;
