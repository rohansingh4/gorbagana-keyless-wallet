import { useState, useEffect } from 'react';
import { AuthClient } from '@dfinity/auth-client';
import { HttpAgent } from '@dfinity/agent';
import { gor_keyless_backend } from 'declarations/gor-keyless-backend';
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
    setPrincipal(identity.getPrincipal().toString());

    // Create authenticated agent
    const agent = new HttpAgent({
      identity,
      host: process.env.DFX_NETWORK === "local" ? "http://localhost:4943" : "https://ic0.app",
    });

    // Fetch network root key for local development
    if (process.env.DFX_NETWORK === "local") {
      agent.fetchRootKey();
    }

    // Set the agent for the backend actor
    const authenticatedBackend = gor_keyless_backend._service;
    authenticatedBackend._agent = agent;

    // Generate wallet address for this user
    await generateWallet();
  };

  const login = async () => {
    setLoading(true);
    setError('');
    try {
      await authClient.login({
        identityProvider: process.env.DFX_NETWORK === "local" 
          ? `http://localhost:4943/?canister=${process.env.INTERNET_IDENTITY_CANISTER_ID}` 
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
  };

  const generateWallet = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await gor_keyless_backend.generate_keypair_solana();
      if ('Ok' in result) {
        setWalletAddress(result.Ok);
        await fetchBalance(result.Ok);
      } else {
        setError('Failed to generate wallet: ' + result.Err);
      }
    } catch (err) {
      setError('Error generating wallet: ' + err.message);
    }
    setLoading(false);
  };

  const fetchBalance = async (address = walletAddress) => {
    if (!address) return;
    
    setLoading(true);
    try {
      const result = await gor_keyless_backend.fetch_balance(address);
      if ('Ok' in result) {
        setBalance(result.Ok);
      } else {
        setError('Failed to fetch balance: ' + result.Err);
      }
    } catch (err) {
      setError('Error fetching balance: ' + err.message);
    }
    setLoading(false);
  };

  const sendTransaction = async (e) => {
    e.preventDefault();
    if (!toAddress || !amount) return;

    setLoading(true);
    setError('');
    setTxResult(null);

    try {
      const amountLamports = Math.floor(parseFloat(amount) * 1_000_000_000); // Convert GOR to lamports
      
      const result = await gor_keyless_backend.create_and_sign_transaction({
        to_address: toAddress,
        amount_lamports: amountLamports,
      });

      if ('Ok' in result) {
        setTxResult(result.Ok);
        setToAddress('');
        setAmount('');
        // Refresh balance after transaction
        await fetchBalance();
      } else {
        setError('Transaction failed: ' + result.Err);
      }
    } catch (err) {
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
