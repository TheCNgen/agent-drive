import mongoose, { Document, Schema } from 'mongoose';

export interface ISharedLink extends Document {
  _id: string;
  item: mongoose.Types.ObjectId;
  owner: mongoose.Types.ObjectId;
  linkId: string;
  type: 'public' | 'monetized';
  price?: number;
  priceTinybars?: string;
  title: string;
  description?: string;
  isActive: boolean;
  expiresAt?: Date;
  accessCount: number;
  paidUsers: mongoose.Types.ObjectId[];
  affiliateEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const sharedLinkSchema = new Schema<ISharedLink>({
  item: {
    type: Schema.Types.ObjectId,
    ref: 'Item',
    required: true
  },
  owner: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  linkId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  type: {
    type: String,
    enum: ['public', 'monetized'],
    required: true
  },
  price: {
    type: Number,
    min: 0,
    required: false
  },
  priceTinybars: {
    type: String,
    match: /^[1-9][0-9]*$/,
    required: false
  },
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  description: {
    type: String,
    trim: true,
    maxlength: 500
  },
  isActive: {
    type: Boolean,
    default: true
  },
  expiresAt: {
    type: Date,
    default: null
  },
  accessCount: {
    type: Number,
    default: 0
  },
  paidUsers: [{
    type: Schema.Types.ObjectId,
    ref: 'User'
  }],
  affiliateEnabled: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true,
  collection: 'sharedlinks'
});

sharedLinkSchema.index({ owner: 1, createdAt: -1 });
sharedLinkSchema.index({ type: 1, isActive: 1 });
sharedLinkSchema.index({ expiresAt: 1 }, { 
  expireAfterSeconds: 0,
  partialFilterExpression: { expiresAt: { $ne: null } }
});

// This hook runs after any explicit `.populate('owner', ...)` a caller chains (it fires at
// query-execution time), so its select string is the one that actually wins - a caller-side
// `.populate('owner', '... accountId')` was silently overridden without `accountId` here,
// which is why the purchase flow's "seller has no Hedera account" check always failed.
sharedLinkSchema.pre(['find', 'findOne'], function() {
  this.populate('item', 'name type size mimeType url')
      .populate('owner', 'name email wallet accountId');
});

const SharedLinkModel = mongoose.models.SharedLink || mongoose.model<ISharedLink>('SharedLink', sharedLinkSchema);

export { SharedLinkModel as SharedLink };
export default SharedLinkModel; 