import { useState, useEffect } from 'react';
import { AuthClient } from '@dfinity/auth-client';
import { HttpAgent, Actor } from '@dfinity/agent';
import { gor_keyless_backend } from 'declarations/gor-keyless-backend';
import { idlFactory } from 'declarations/gor-keyless-backend/gor-keyless-backend.did.js';
import './App.css';
import { completeTransaction, prepareTransaction } from './submitter';

console.log = () => { };
console.error = () => { };
console.warn = () => { };

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
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  // Transaction form states
  const [toAddress, setToAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [txResult, setTxResult] = useState(null);

  useEffect(() => {
    console.log = () => { };
    console.error = () => { };
    console.warn = () => { };
  }, []);

  useEffect(() => {
    initAuth();
  }, []);

  useEffect(() => {
    if (showToast) {
      const timer = setTimeout(() => {
        setShowToast(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [showToast]);

  const showToastMessage = (message) => {
    setToastMessage(message);
    setShowToast(true);
  };

  const copyToClipboard = async (text, label) => {
    try {
      await navigator.clipboard.writeText(text);
      showToastMessage(`${label} copied!`);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

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
      const agent = new HttpAgent({
        identity,
        host: process.env.DFX_NETWORK === "local" ? "http://localhost:4943" : "https://ic0.app",
      });

      if (process.env.DFX_NETWORK === "local") {
        await agent.fetchRootKey();
      }

      const canisterId = process.env.CANISTER_ID_GOR_KEYLESS_BACKEND || "u6s2n-gx777-77774-qaaba-cai";
      const backend = Actor.createActor(idlFactory, { agent, canisterId });

      setAuthenticatedBackend(backend);

      const storedWallet = localStorage.getItem(`wallet_${principalStr}`);
      if (storedWallet) {
        setWalletAddress(storedWallet);
        await fetchBalance(storedWallet, backend);
      } else {
        await generateWallet(backend, principalStr);
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

  const generateWallet = async (backend = authenticatedBackend, p = principal) => {
    if (!backend) {
      setError('Backend not available.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const result = await backend.generate_keypair_solana();
      if ('Ok' in result) {
        const walletAddr = result.Ok;
        setWalletAddress(walletAddr);
        localStorage.setItem(`wallet_${p}`, walletAddr);
        await fetchBalance(walletAddr, backend);
      } else {
        setError('Failed to generate wallet: ' + result.Err);
      }
    } catch (err) {
      setError('Error generating wallet: ' + err.message);
    }
    setLoading(false);
  };

  const fetchBalance = async (address = walletAddress, backend = authenticatedBackend) => {
    if (!address || !backend) return;

    setLoading(true);

    try {
      const result = await backend.fetch_balance(address);
      console.log("first", result);
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
    if (!toAddress || !amount || !authenticatedBackend) return;

    setLoading(true);
    setError('');
    setTxResult(null);

    try {
      const prepParams = {
        senderPublicKeyString: walletAddress,
        receiverPublicKeyString: toAddress,
        transferAmt: amount
      };
      const params = await prepareTransaction(prepParams);
      const result = await authenticatedBackend.sign_transaction_solana(params.base64Message);
      console.log("result", result, params);

      if ('Ok' in result) {
        const txId = await completeTransaction({
          ...params,
          signatureHex: result.Ok
        });
        console.log("txId", txId);
        setTxResult(txId);
        setToAddress('');
        setAmount('');
        fetchBalance();
        setTimeout(() => fetchBalance(), 5000);
        showToastMessage('Transaction signed successfully!');
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
        <h1>KOSH</h1>
        <p>A Keyless Wallet on Gorbagana Chain.</p>
      </header>

      <div className="main-card">
        {!isAuthenticated ? (
          <div className="auth-section">
            <h2>Welcome Back</h2>
            <p>Sign in with your Internet Identity to continue.</p>
            <button
              onClick={login}
              disabled={loading}
              className="login-button"
            >
              {loading ? 'Connecting...' : 'Sign In With Internet Identity'}
            </button>
          </div>
        ) : (
          <div className="wallet-section">
            <div className="user-info">
              <div className="user-info-header">
                <h3>Dashboard</h3>
                <button onClick={logout} className="logout-button">Sign Out</button>
              </div>
              <div className="address-box">
                <div className="address-item">
                  <div className="address-label">Principal ID</div>
                  <div className="address-display">
                    <span className="address-text">
                      {principal.length > 8 ? `${principal.substring(0, 12)}....${principal.substring(principal.length - 12)}` : principal}
                    </span>
                    <button
                      className="copy-button"
                      onClick={() => copyToClipboard(principal, 'Principal ID')}
                      title="Copy Principal ID"
                    >
                      📋
                    </button>
                  </div>
                </div>
                {walletAddress && (
                  <div className="address-item">
                    <div className="address-label">Solana Wallet</div>
                    <div className="address-display">
                      <span className="address-text">
                        {walletAddress.length > 8 ? `${walletAddress.substring(0, 12)}....${walletAddress.substring(walletAddress.length - 12)}` : walletAddress}
                      </span>
                      <button
                        className="copy-button"
                        onClick={() => copyToClipboard(walletAddress, 'Wallet Address')}
                        title="Copy Wallet Address"
                      >
                        📋
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="balance-section">
              {balance ? (
                <div className="balance-amount-container">
                  <div className="balance-amount">{balance.balance_gor.toFixed(4)}</div>
                  <div className="balance-subtitle">GOR</div>
                </div>
              ) : (
                <div className="balance-amount">--</div>
              )}
              <div className="balance-actions">
                <button onClick={() => fetchBalance()} disabled={loading}>
                  {loading ? 'Refreshing...' : 'Refresh'}
                </button>
                {!walletAddress && (
                  <button onClick={() => generateWallet()} disabled={loading}>
                    {loading ? 'Generating...' : 'Generate Wallet'}
                  </button>
                )}
              </div>
            </div>

            <div className="transaction-section">
              <h3>Send GOR</h3>
              <form onSubmit={sendTransaction}>
                <div className="form-group">
                  <label htmlFor="toAddress">Recipient Address</label>
                  <input
                    id="toAddress"
                    type="text"
                    value={toAddress}
                    onChange={(e) => setToAddress(e.target.value)}
                    placeholder="Enter recipient's Solana address"
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="amount">Amount in GOR</label>
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
                <button type="submit" disabled={loading || !toAddress || !amount} className="submit-button">
                  {loading ? 'Signing...' : 'Sign & Send Transaction'}
                </button>
              </form>
            </div>

            {txResult && (
              <div className="result-card transaction-result">
                <h3>✅ Transaction Signed</h3>
                <div className="address-display">
                  <p>Signature: <code>{txResult && txResult.length > 24 ? `${txResult.substring(0, 12)}....${txResult.substring(txResult.length - 12)}` : txResult}</code></p>
                  <button
                    className="copy-button"
                    onClick={() => copyToClipboard(txResult, 'Transaction Signature')}
                    title="Copy Transaction Signature"
                  >
                    📋
                  </button>
                  <a
                    href={`https://gorbaganachain.xyz/#explorer?transaction=${txResult}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="explorer-link"
                    title="View on Explorer"
                  >
                    ↗️
                  </a>
                </div>
              </div>
            )}

            {error && (
              <div className="result-card error-message">
                <p>❌ {error}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {showToast && (
        <div className="toast">
          {toastMessage}
        </div>
      )}
    </div>
  );
}

export default App;
