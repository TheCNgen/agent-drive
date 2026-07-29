import mongoose, { Schema } from 'mongoose';

export const ALL_SCOPES = [
  'items:read',
  'items:write',
  'listings:read',
  'listings:write',
  'sharedlinks:read',
  'sharedlinks:write',
  'transactions:read',
  'affiliates:read',
  'affiliates:write',
  'ai:invoke',
  'payments:spend',
] as const;

export type Scope = typeof ALL_SCOPES[number];

export const DEFAULT_SCOPES: Scope[] = ALL_SCOPES.filter((s) => s !== 'payments:spend') as Scope[];

const AgentSchema = new Schema(
  {
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true, immutable: true },
    name: { type: String, required: true, trim: true, maxlength: 64 },
    status: { type: String, enum: ['pending', 'active', 'revoked'], default: 'pending', index: true },
    scopes: { type: [String], default: () => [...DEFAULT_SCOPES] },

    keyHash: { type: String, default: null }, // SHA-256 hex of the API key
    keyPrefix: { type: String, default: null, index: true },

    evmAddress: { type: String, default: null, lowercase: true, index: true },
    accountId: { type: String, default: null }, // '0.0.x' once the account exists
    publicKey: { type: String, default: null }, // DER hex - public only
    network: { type: String, default: 'hedera-testnet' },

    onboardingState: {
      type: String,
      enum: ['waiting', 'claimed', 'wallet', 'funded', 'active', 'expired', 'revoked'],
      default: 'waiting',
      index: true,
    },
    fundedAt: { type: Date, default: null },
    activatedAt: { type: Date, default: null },
    lastSeenAt: { type: Date, default: null },
    revokedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

AgentSchema.index({ owner: 1, createdAt: -1 });

// Non-custodial guarantee: a private key must never be persisted on an Agent.
// The schema simply has no such field, so Mongoose strict mode drops one on
// write; this pre-validate hook is a second, explicit layer of defense.
AgentSchema.pre('validate', function (next) {
  if (this.get('privateKey') !== undefined) {
    return next(new Error('privateKey must never be stored on Agent'));
  }
  next();
});

export const Agent = mongoose.models.Agent || mongoose.model('Agent', AgentSchema);
