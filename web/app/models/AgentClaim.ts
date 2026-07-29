import mongoose, { Schema } from 'mongoose';

const AgentClaimSchema = new Schema(
  {
    agent: { type: Schema.Types.ObjectId, ref: 'Agent', required: true, index: true },
    codeHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    claimedAt: { type: Date, default: null },
    claimedByIp: { type: String, default: null },
    claimedByClient: { type: String, default: null },
  },
  { timestamps: true }
);

// Cleanup only - not enforcement. Expiry is enforced by the expiresAt query
// clause at redemption time; the TTL monitor runs ~once/minute and is
// deliberately offset an hour past expiresAt so the dashboard can still show
// an "expired" state before the row disappears.
AgentClaimSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 3600 });

export const AgentClaim = mongoose.models.AgentClaim || mongoose.model('AgentClaim', AgentClaimSchema);
