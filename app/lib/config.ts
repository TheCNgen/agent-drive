export const config = {
  mongo: {
    uri: process.env.MONGODB_URI,
  },
  auth: {
    secret: process.env.NEXTAUTH_SECRET,
    url: process.env.NEXTAUTH_URL || "http://localhost:3000",
  },
  hedera: {
    network: process.env.HEDERA_NETWORK || "testnet",
    operatorId: process.env.HEDERA_OPERATOR_ID,
    operatorKey: process.env.HEDERA_OPERATOR_KEY,
    treasuryAccountId: process.env.PLATFORM_TREASURY_ACCOUNT_ID,
    treasuryKey: process.env.PLATFORM_TREASURY_KEY,
    mirrorNodeUrl: process.env.HEDERA_MIRROR_NODE_URL || "https://testnet.mirrornode.hedera.com",
    provenanceTopicId: process.env.HCS_PROVENANCE_TOPIC_ID,
    facilitatorUrl: process.env.X402_FACILITATOR_URL || "https://api.testnet.blocky402.com",
    feePayer: process.env.X402_FEE_PAYER || "0.0.7162784",
    platformFeeBps: parseInt(process.env.PLATFORM_FEE_BPS || "500", 10),
    faucetDripEnabled: process.env.FAUCET_DRIP_ENABLED === "true",
    faucetDripTinybars: process.env.FAUCET_DRIP_TINYBARS || "500000000",
  },
  gcs: {
    projectId: process.env.GCP_PROJECT_ID,
    bucketName: process.env.GCS_BUCKET_NAME,
    location: process.env.GCS_LOCATION || "europe-west1",
    credentials: process.env.GOOGLE_APPLICATION_CREDENTIALS,
  },
  kms: {
    keyName: process.env.GCP_KMS_KEY_NAME,
  },
  mistral: {
    apiKey: process.env.MISTRAL_API_KEY,
    chatModel: process.env.MISTRAL_CHAT_MODEL || "mistral-large-latest",
    embedModel: process.env.MISTRAL_EMBED_MODEL || "mistral-embed",
    ocrModel: process.env.MISTRAL_OCR_MODEL || "mistral-ocr-latest",
  },
  hostName: process.env.NEXT_PUBLIC_HOST_NAME || "http://localhost:3000",
  env: process.env.NODE_ENV || "development",
};

// Assert region at boot
if (config.kms.keyName && !config.kms.keyName.includes(`/locations/${config.gcs.location}/`)) {
  throw new Error(`Region mismatch! KMS key must be in the same region as GCS (${config.gcs.location}). Found KMS Key Name: ${config.kms.keyName}`);
}

// Ensure required environment variables
const required = [
  ["mongo.uri", config.mongo.uri],
  ["auth.secret", config.auth.secret],
  ["hedera.operatorId", config.hedera.operatorId],
  ["hedera.operatorKey", config.hedera.operatorKey],
  ["hedera.treasuryAccountId", config.hedera.treasuryAccountId],
  ["hedera.treasuryKey", config.hedera.treasuryKey],
  ["gcs.bucketName", config.gcs.bucketName],
  ["kms.keyName", config.kms.keyName],
  ["mistral.apiKey", config.mistral.apiKey],
];

for (const [name, value] of required) {
  if (!value) {
    throw new Error(`Missing required configuration: ${name}`);
  }
}
