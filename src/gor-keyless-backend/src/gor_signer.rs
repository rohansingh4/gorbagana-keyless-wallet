use candid::CandidType;
use candid::Principal;
use bs58;
use serde::{Deserialize, Serialize};
use base64::{Engine as _, engine::general_purpose};
use ic_cdk::api::management_canister::http_request::{
    http_request, CanisterHttpRequestArgument, HttpHeader, HttpMethod, HttpResponse, TransformArgs, TransformContext
};
use std::cell::RefCell;
use ic_stable_structures::memory_manager::{MemoryId, MemoryManager, VirtualMemory};
use ic_stable_structures::{DefaultMemoryImpl, StableBTreeMap, Storable, storable::Bound};
use std::borrow::Cow;

type CanisterId = Principal;
type Memory = VirtualMemory<DefaultMemoryImpl>;

#[derive(Clone, Debug, CandidType, Deserialize, Serialize)]
struct CounterData {
    accounts: u64,
    transactions: u64,
}

impl Storable for CounterData {
    fn to_bytes(&self) -> Cow<[u8]> {
        Cow::Owned(candid::encode_one(self).unwrap())
    }

    fn from_bytes(bytes: Cow<[u8]>) -> Self {
        candid::decode_one(&bytes).unwrap()
    }

    const BOUND: Bound = Bound::Unbounded;
}

#[derive(Clone, Debug, CandidType, Deserialize, Serialize, PartialEq, Eq, PartialOrd, Ord)]
struct AccountKey(String);

impl Storable for AccountKey {
    fn to_bytes(&self) -> Cow<[u8]> {
        Cow::Borrowed(self.0.as_bytes())
    }

    fn from_bytes(bytes: Cow<[u8]>) -> Self {
        AccountKey(String::from_utf8(bytes.to_vec()).unwrap())
    }

    const BOUND: Bound = Bound::Unbounded;
}

#[derive(Clone, Debug, CandidType, Deserialize, Serialize, PartialEq, Eq, PartialOrd, Ord)]
struct AccountValue(String);

impl Storable for AccountValue {
    fn to_bytes(&self) -> Cow<[u8]> {
        Cow::Borrowed(self.0.as_bytes())
    }

    fn from_bytes(bytes: Cow<[u8]>) -> Self {
        AccountValue(String::from_utf8(bytes.to_vec()).unwrap())
    }

    const BOUND: Bound = Bound::Unbounded;
}

thread_local! {
    static MEMORY_MANAGER: RefCell<MemoryManager<DefaultMemoryImpl>> = RefCell::new(
        MemoryManager::init(DefaultMemoryImpl::default())
    );

    static COUNTER_STORAGE: RefCell<StableBTreeMap<AccountKey, CounterData, Memory>> = RefCell::new(
        StableBTreeMap::init(
            MEMORY_MANAGER.with(|m| m.borrow().get(MemoryId::new(0)))
        )
    );

    static ACCOUNT_STORAGE: RefCell<StableBTreeMap<AccountKey, AccountValue, Memory>> = RefCell::new(
        StableBTreeMap::init(
            MEMORY_MANAGER.with(|m| m.borrow().get(MemoryId::new(1)))
        )
    );
}

#[derive(CandidType, Debug)]
pub struct PublicKeyReply {
    pub public_key_hex: String,
}

#[derive(CandidType, Serialize, Deserialize, Debug)]
pub struct SolanaBlockhash {
    pub blockhash: String,
    pub last_valid_block_height: u64,
}

#[derive(CandidType, Serialize, Deserialize, Debug)]
pub struct PreparedTransaction {
    pub base64_message: String,
    pub blockhash: String,
    pub last_valid_block_height: u64,
    pub sender_pubkey: String,
    pub receiver_pubkey: String,
    pub amount_lamports: u64,
}

#[derive(CandidType, Debug)]
struct ManagementCanisterSignatureRequest {
    pub message: Vec<u8>,
    pub derivation_path: Vec<Vec<u8>>,
    pub key_id: SchnorrKeyId,
}

#[derive(CandidType, Deserialize, Debug)]
struct ManagementCanisterSignatureReply {
    pub signature: Vec<u8>,
}

#[derive(CandidType, Serialize, Deserialize, Debug, Copy, Clone)]
pub enum SchnorrAlgorithm {
    #[serde(rename = "ed25519")]
    Ed25519,
}

#[derive(Serialize, Deserialize, CandidType, Debug)]
struct ManagementCanisterSchnorrPublicKeyReply {
    pub public_key: Vec<u8>,
    pub chain_code: Vec<u8>,
}

#[derive(CandidType, Debug)]
struct SchnorrKeyId {
    pub algorithm: SchnorrAlgorithm,
    pub name: String,
}

#[derive(CandidType, Debug)]
struct ManagementCanisterSchnorrPublicKeyRequest {
    pub canister_id: Option<CanisterId>,
    pub derivation_path: Vec<Vec<u8>>,
    pub key_id: SchnorrKeyId,
}

#[derive(CandidType, Serialize, Deserialize, Debug)]
pub struct BalanceResponse {
    pub balance_lamports: u64,
    pub balance_gor: f64,
}

#[derive(CandidType, Serialize, Deserialize, Debug)]
pub struct WalletStats {
    pub total_accounts: u64,
    pub total_transactions: u64,
}

#[derive(Serialize, Deserialize, Debug)]
struct JsonRpcRequest {
    jsonrpc: String,
    id: u64,
    method: String,
    params: Vec<serde_json::Value>,
}

#[derive(Serialize, Deserialize, Debug)]
struct JsonRpcResponse {
    jsonrpc: String,
    id: u64,
    result: Option<serde_json::Value>,
    error: Option<serde_json::Value>,
}

#[ic_cdk::query]
fn whoami() -> Principal {
    ic_cdk::caller()
}

fn get_counters() -> CounterData {
    COUNTER_STORAGE.with(|storage| {
        storage.borrow()
            .get(&AccountKey("counters".to_string()))
            .unwrap_or(CounterData { accounts: 0, transactions: 0 })
    })
}

fn update_counters(data: CounterData) {
    COUNTER_STORAGE.with(|storage| {
        storage.borrow_mut().insert(AccountKey("counters".to_string()), data);
    });
}

#[ic_cdk::query]
fn get_total_accounts() -> u64 {
    get_counters().accounts
}

#[ic_cdk::query]
fn get_total_transactions() -> u64 {
    get_counters().transactions
}

#[ic_cdk::update]
fn increment_transaction_counter() -> u64 {
    let caller = ic_cdk::caller();
    
    // Don't allow anonymous calls
    if caller == Principal::anonymous() {
        ic_cdk::trap("Anonymous caller not allowed");
    }
    
    let mut counters = get_counters();
    counters.transactions += 1;
    update_counters(counters.clone());
    
    ic_cdk::println!("Transaction completed! Total transactions: {}", counters.transactions);
    counters.transactions
}

#[ic_cdk::query]
fn get_wallet_stats() -> WalletStats {
    let counters = get_counters();
    WalletStats {
        total_accounts: counters.accounts,
        total_transactions: counters.transactions,
    }
}

#[ic_cdk::update]
async fn generate_keypair_solana() -> Result<String, String> {
    let caller = ic_cdk::caller();

    // Don't allow anonymous calls
    if caller == Principal::anonymous() {
        return Err("Anonymous caller not allowed".to_string());
    }

    ic_cdk::println!("Generating keypair for caller: {:?}", caller);

    let caller_bytes = caller.as_slice().to_vec();

    let request = ManagementCanisterSchnorrPublicKeyRequest {
        canister_id: None,
        derivation_path: vec![caller_bytes], // Use caller's principal as derivation path
        key_id: SchnorrKeyId {
            algorithm: SchnorrAlgorithm::Ed25519,
            name: String::from("dfx_test_key"),
        },
    };

    ic_cdk::println!("generate_keypair_solana: {:?}" ,request);

    let (res,): (ManagementCanisterSchnorrPublicKeyReply,) = ic_cdk::call(
        Principal::management_canister(),
        "schnorr_public_key",
        (request,),
    )
    .await // Add the await keyword
    .map_err(|e| format!("schnorr_public_key failed {}", e.1))?;

    // Generate or obtain the private key

    ic_cdk::println!("res {:?}", res);
    let public_key_bytes = res.public_key.to_vec();


    // ic_cdk::println!("public_key_bytes {:?}", public_key_bytes);
    let hex_string: String = public_key_bytes.iter()
    .map(|b| format!("{:02X}", b)) // Convert each byte to uppercase hex
    .collect();

    ic_cdk::println!("Raw Public Key (Hex): {}", hex_string);


    if public_key_bytes.len() != 32 {
        return Err("Invalid public key length; expected 32 bytes".to_string());
    }

    // Convert the public key to a Solana address (Base58 encoding)
    // let solana_address = encode_base58(&public_key_bytes);
    let solana_address = bs58::encode(public_key_bytes).into_string();
    // let pubkey = Pubkey::new(&public_key_bytes);
    ic_cdk::println!("Solana Address: {}", solana_address);

    // Check if this is a new account and increment counter
    let is_new_account = ACCOUNT_STORAGE.with(|storage| {
        let mut storage_ref = storage.borrow_mut();
        let key = AccountKey(solana_address.clone());
        if storage_ref.get(&key).is_none() {
            storage_ref.insert(key, AccountValue("generated".to_string()));
            true
        } else {
            false
        }
    });

    if is_new_account {
        let mut counters = get_counters();
        counters.accounts += 1;
        update_counters(counters.clone());
        ic_cdk::println!("New account generated! Total accounts: {}", counters.accounts);
    }

    Ok(solana_address)
}



#[ic_cdk::update]
async fn sign_transaction_solana(hash: String) -> Result<String, String> {
    let caller = ic_cdk::caller();

    // Don't allow anonymous calls for signing
    if caller == Principal::anonymous() {
        return Err("Anonymous caller not allowed for signing".to_string());
    }

    ic_cdk::println!("Signing transaction for caller: {:?}", caller);
    ic_cdk::println!("Transaction hash: {:?}", hash);

    let hash_bytes = general_purpose::STANDARD.decode(&hash)
        .map_err(|e| format!("Invalid Base64 string: {}", e))?;

    ic_cdk::println!("Hash bytes: {:?}", hash_bytes);

    // Use caller's principal as derivation path for user-specific keys
    let caller_bytes = caller.as_slice().to_vec();

    let internal_request = ManagementCanisterSignatureRequest {
        message: hash_bytes,
        derivation_path: vec![caller_bytes], // Use caller's principal as derivation path
        key_id: SchnorrKeyId {
            algorithm: SchnorrAlgorithm::Ed25519,
            name: String::from("dfx_test_key"),
        },
    };

    let (internal_reply,): (ManagementCanisterSignatureReply,) =
        ic_cdk::api::call::call_with_payment(
            Principal::management_canister(),
            "sign_with_schnorr",
            (internal_request,),
            26_153_846_153,
        )
        .await
        .map_err(|e| format!("sign_with_schnorr failed {e:?}"))?;

    ic_cdk::println!("Signature generated: {:?}", internal_reply);
    Ok(hex::encode(&internal_reply.signature))
}

#[derive(CandidType, Serialize, Deserialize, Debug)]
pub struct SendTransactionRequest {
    pub to_address: String,
    pub amount_lamports: u64,
}

#[derive(CandidType, Serialize, Deserialize, Debug)]
pub struct SignedTransactionResponse {
    pub transaction_base64: String,
    pub signature_hex: String,
    pub from_address: String,
    pub to_address: String,
    pub amount_lamports: u64,
}

#[ic_cdk::update]
async fn create_and_sign_transaction(request: SendTransactionRequest) -> Result<SignedTransactionResponse, String> {
    let caller = ic_cdk::caller();

    // Don't allow anonymous calls for signing
    if caller == Principal::anonymous() {
        return Err("Anonymous caller not allowed for transaction signing".to_string());
    }

    ic_cdk::println!("Creating transaction for caller: {:?}", caller);
    ic_cdk::println!("To: {}, Amount: {} lamports", request.to_address, request.amount_lamports);

    // First, generate the sender's public key/address
    let sender_address = generate_keypair_solana().await?;

    // Here you would normally:
    // 1. Fetch recent blockhash from GOR RPC
    // 2. Create a proper Solana transaction
    // 3. Serialize it for signing
    // 4. Sign the transaction hash

    // For now, let's create a simple message to sign (you'll need to implement proper transaction creation)
    let transaction_message = format!(
        "{{\"from\":\"{}\",\"to\":\"{}\",\"amount\":{},\"timestamp\":{}}}",
        sender_address,
        request.to_address,
        request.amount_lamports,
        ic_cdk::api::time()
    );

    ic_cdk::println!("Transaction message: {}", transaction_message);

    // Convert to base64 for signing
    let transaction_base64 = general_purpose::STANDARD.encode(transaction_message.as_bytes());

    // Sign the transaction
    let signature_hex = sign_transaction_solana(transaction_base64.clone()).await?;

    Ok(SignedTransactionResponse {
        transaction_base64,
        signature_hex,
        from_address: sender_address,
        to_address: request.to_address,
        amount_lamports: request.amount_lamports,
    })
}

#[ic_cdk::update]
async fn fetch_balance(address: String) -> Result<BalanceResponse, String> {
    ic_cdk::println!("Fetching balance for address: {}", address);

    // Create JSON-RPC request for getBalance
    let rpc_request = JsonRpcRequest {
        jsonrpc: "2.0".to_string(),
        id: 1,
        method: "getBalance".to_string(),
        params: vec![serde_json::Value::String(address.clone())],
    };

    let request_body = serde_json::to_string(&rpc_request)
        .map_err(|e| format!("Failed to serialize JSON-RPC request: {}", e))?;

    ic_cdk::println!("Request body: {}", request_body);

    let request = CanisterHttpRequestArgument {
        url: "https://gorchain.wstf.io".to_string(),
        method: HttpMethod::POST,
        body: Some(request_body.as_bytes().to_vec()),
        max_response_bytes: Some(2000),
        transform: Some(TransformContext::from_name("transform".to_string(), serde_json::to_vec(&()).unwrap())),
        headers: vec![
            HttpHeader {
                name: "Content-Type".to_string(),
                value: "application/json".to_string(),
            },
        ],
    };

    match http_request(request, 25_000_000_000).await {
        Ok((response,)) => {
            ic_cdk::println!("HTTP Response status: {}", response.status);

            let response_body = String::from_utf8(response.body)
                .map_err(|e| format!("Invalid UTF-8 response: {}", e))?;

            ic_cdk::println!("Response body: {}", response_body);

            let rpc_response: JsonRpcResponse = serde_json::from_str(&response_body)
                .map_err(|e| format!("Failed to parse JSON-RPC response: {}", e))?;

            if let Some(error) = rpc_response.error {
                return Err(format!("RPC Error: {}", error));
            }

            if let Some(result) = rpc_response.result {
                if let Some(value_obj) = result.as_object() {
                    if let Some(value) = value_obj.get("value") {
                        let balance_lamports = value.as_u64()
                            .ok_or_else(|| "Balance value is not a valid number".to_string())?;

                        let balance_gor = balance_lamports as f64 / 1_000_000_000.0; // Convert lamports to GOR

                        return Ok(BalanceResponse {
                            balance_lamports,
                            balance_gor,
                        });
                    }
                }

                // Fallback: try to parse result directly as number
                if let Some(balance_lamports) = result.as_u64() {
                    let balance_gor = balance_lamports as f64 / 1_000_000_000.0;
                    return Ok(BalanceResponse {
                        balance_lamports,
                        balance_gor,
                    });
                }

                return Err(format!("Unexpected result format: {}", result));
            }

            Err("No result in RPC response".to_string())
        }
        Err((r, m)) => {
            let message = format!("HTTP request failed with RejectionCode: {:?}, Error: {}", r, m);
            ic_cdk::println!("{}", message);
            Err(message)
        }
    }
}

#[ic_cdk::query]
fn transform(raw: TransformArgs) -> HttpResponse {
    let _headers = vec![
        HttpHeader {
            name: "Content-Security-Policy".to_string(),
            value: "default-src 'self'".to_string(),
        },
        HttpHeader {
            name: "Referrer-Policy".to_string(),
            value: "strict-origin".to_string(),
        },
        HttpHeader {
            name: "Permissions-Policy".to_string(),
            value: "geolocation=(self)".to_string(),
        },
        HttpHeader {
            name: "Strict-Transport-Security".to_string(),
            value: "max-age=63072000".to_string(),
        },
        HttpHeader {
            name: "X-Frame-Options".to_string(),
            value: "DENY".to_string(),
        },
        HttpHeader {
            name: "X-Content-Type-Options".to_string(),
            value: "nosniff".to_string(),
        },
    ];

    let mut sanitized_headers = Vec::new();
    for header in raw.response.headers {
        if header.name.to_lowercase().starts_with("x-")
            || header.name.to_lowercase() == "content-type"
            || header.name.to_lowercase() == "content-length" {
            sanitized_headers.push(header);
        }
    }

    HttpResponse {
        status: raw.response.status,
        body: raw.response.body,
        headers: sanitized_headers,
    }
}

#[ic_cdk::init]
fn init() {
    ic_cdk::println!("Initializing GOR Keyless Wallet backend");
}

#[ic_cdk::pre_upgrade]
fn pre_upgrade() {
    ic_cdk::println!("Preparing for upgrade");
}

#[ic_cdk::post_upgrade]
fn post_upgrade() {
    ic_cdk::println!("Upgrade completed");
}

ic_cdk::export_candid!();
