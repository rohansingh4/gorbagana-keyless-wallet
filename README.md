# GOR Keyless Wallet 🔐

A secure, passwordless blockchain wallet for the GOR blockchain using Internet Identity authentication and threshold cryptography on the Internet Computer.

## 🌟 Features

- **🔒 Keyless Authentication**: Uses Internet Identity with passkeys, Face ID, Touch ID, or YubiKey
- **🔐 No Private Keys**: Wallets are derived from user's Internet Identity principal using threshold cryptography
- **⚡ Instant Access**: Returning users see their wallet immediately (stored locally)
- **🌐 GOR Blockchain Integration**: Fetches balances and signs transactions for GOR blockchain
- **💸 Secure Transactions**: Transaction signing without exposing private keys
- **📱 Modern UI**: Beautiful, responsive interface built with React

## 🏗️ Architecture

- **Backend**: Rust canister using `ic-cdk` for threshold cryptography
- **Frontend**: React application with Internet Identity integration
- **Blockchain**: GOR (Solana fork) running at `https://gorchain.wstf.io`
- **Authentication**: Internet Identity for passwordless login
- **Cryptography**: Threshold ECDSA via Internet Computer's management canister

## 📋 Prerequisites

- **Node.js** (v16 or higher)
- **Rust** (latest stable version)
- **DFX** (Internet Computer SDK)
- **dfx** version 0.15.0 or higher

## 🚀 Quick Setup

### 1. Install Dependencies

```bash
# Install DFX (Internet Computer SDK)
sh -ci "$(curl -fsSL https://internetcomputer.org/install.sh)"

# Update Rust to latest version
rustup update
rustup default stable

# Verify versions
rustc --version  # Should be 1.78.0 or higher
dfx --version    # Should be 0.15.0 or higher
```

### 2. Clone and Setup Project

```bash
git clone <your-repo-url>
cd gor-keyless

# Install frontend dependencies
cd src/gor-keyless-frontend
npm install
cd ../..
```

### 3. Start Local Internet Computer

```bash
# Start the local Internet Computer replica
dfx start --background

# Create canisters
dfx canister create gor-keyless-backend
dfx canister create gor-keyless-frontend
```

### 4. Deploy Internet Identity

```bash
# Deploy Internet Identity locally
dfx deps pull
dfx deps init
dfx deps deploy
```

### 5. Build and Deploy

```bash
# Generate new Cargo.lock with updated dependencies
rm Cargo.lock
cargo generate-lockfile

# Build all canisters
dfx build

# Deploy all canisters
dfx deploy
```

## 🎯 Usage

### Access Your Wallet

After deployment, visit the frontend URL:
```
http://uxrrr-q7777-77774-qaaaq-cai.localhost:4943/
```
(Replace with your actual canister ID)

### Authentication Flow

1. **Click "Sign in with Internet Identity"**
2. **Create or use existing identity** using:
   - Passkey (Face ID, Touch ID, Windows Hello)
   - Security key (YubiKey)
   - Recovery phrase (backup method)
3. **Wallet generates automatically** or loads existing wallet
4. **View balance** from GOR blockchain
5. **Send transactions** with secure signing

### Backend Functions

Test backend functions directly via Candid interface:
```
http://127.0.0.1:4943/?canisterId=<candid-ui-id>&id=<your-backend-canister-id>
```

Available functions:
- `whoami()` - Get caller's principal
- `generate_keypair_solana()` - Generate user's wallet address
- `fetch_balance(address)` - Get GOR balance from blockchain
- `sign_transaction_solana(hash)` - Sign transaction hash
- `create_and_sign_transaction(request)` - Complete transaction flow

## 🛠️ Development Commands

### Backend Development

```bash
# Build backend only
dfx build gor-keyless-backend

# Deploy backend only  
dfx deploy gor-keyless-backend

# Check backend logs
dfx canister logs gor-keyless-backend
```

### Frontend Development

```bash
# Build frontend only
dfx build gor-keyless-frontend

# Deploy frontend only
dfx deploy gor-keyless-frontend

# Start development server
cd src/gor-keyless-frontend
npm start
```

### Testing

```bash
# Test backend functions via dfx
dfx canister call gor-keyless-backend whoami
dfx canister call gor-keyless-backend generate_keypair_solana

# Test with authenticated call (requires Internet Identity login)
dfx canister call gor-keyless-backend fetch_balance '("your-address-here")'
```

## 🔧 Configuration

### Environment Variables

The project automatically detects local vs. production environment:
- **Local**: `DFX_NETWORK=local`
- **Production**: `DFX_NETWORK=ic`

### Canister IDs

Update canister IDs in:
- `dfx.json` - Main configuration
- `src/gor-keyless-frontend/src/App.jsx` - Frontend configuration

### GOR Blockchain RPC

Default RPC endpoint: `https://gorchain.wstf.io`

To change, update in `src/gor-keyless-backend/src/gor_signer.rs`:
```rust
url: "https://your-gor-rpc-endpoint.com".to_string(),
```

## 📁 Project Structure

```
gor-keyless/
├── dfx.json                                 # DFX configuration
├── Cargo.toml                              # Rust workspace
├── src/
│   ├── gor-keyless-backend/                # Backend canister
│   │   ├── Cargo.toml                      # Backend dependencies
│   │   ├── gor-keyless-backend.did         # Candid interface
│   │   └── src/
│   │       ├── lib.rs                      # Main library
│   │       └── gor_signer.rs               # GOR blockchain integration
│   └── gor-keyless-frontend/               # Frontend application
│       ├── package.json                    # Frontend dependencies
│       ├── src/
│       │   ├── App.jsx                     # Main React component
│       │   └── App.css                     # Styling
│       └── public/                         # Static assets
└── README.md                               # This file
```

## 🔒 Security Features

### Keyless Architecture
- **No private keys stored** anywhere
- **Threshold cryptography** via Internet Computer
- **Deterministic wallets** derived from Internet Identity principal
- **Secure authentication** with biometric factors

### Authentication Protection
- Anonymous calls blocked for sensitive operations
- Caller identity verification for all transactions
- Secure HTTP outcalls with request transformation

## 🐛 Troubleshooting

### Common Issues

#### 1. "CanisterIdNotFound" Error
```bash
# Ensure Internet Identity is deployed
dfx deps deploy
```

#### 2. Build Errors with Rust
```bash
# Update Rust and regenerate lock file
rustup update
rustup default stable
rm Cargo.lock
cargo generate-lockfile
dfx build
```

#### 3. Frontend Not Loading
```bash
# Rebuild and redeploy frontend
dfx build gor-keyless-frontend
dfx deploy gor-keyless-frontend
```

#### 4. Authentication Issues
```bash
# Check browser console for detailed error logs
# Clear localStorage to reset wallet state
localStorage.clear()
```

### Reset Everything

```bash
# Stop dfx
dfx stop

# Clean build artifacts
dfx clean

# Remove canister state
rm -rf .dfx/

# Start fresh
dfx start --background
dfx canister create --all
dfx deps deploy
dfx deploy
```

## 🌐 Deployment to Mainnet

### 1. Prepare for Mainnet

```bash
# Add mainnet network
dfx network create mainnet --provider https://ic0.app

# Get cycles for deployment
dfx ledger account-id
# Send ICP to this account, then convert to cycles
dfx ledger create-canister $(dfx identity get-principal) --amount 2.0
```

### 2. Deploy to Mainnet

```bash
# Deploy to mainnet
dfx deploy --network mainnet

# Update frontend with mainnet URLs
# Edit src/gor-keyless-frontend/src/App.jsx to use mainnet Identity Provider
```

## 📚 Additional Resources

- [Internet Computer Documentation](https://internetcomputer.org/docs/)
- [Internet Identity Guide](https://internetcomputer.org/docs/current/developer-docs/integrations/internet-identity/)
- [Threshold ECDSA Documentation](https://internetcomputer.org/docs/current/developer-docs/smart-contracts/encryption/t-ecdsa/)
- [DFX Command Reference](https://internetcomputer.org/docs/current/references/cli-reference/)

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License.

---

**🎉 Your GOR Keyless Wallet is ready to use! Sign in with Internet Identity and start managing your GOR tokens securely without private keys.**
