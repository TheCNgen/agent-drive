// This file ensures all models are registered in the correct order
// Import this file in API routes to prevent schema registration issues

import { Item } from '@/app/models/Item';
import { Listing } from '@/app/models/Listing';
import { SharedLink } from '@/app/models/SharedLink';
import { Transaction } from '@/app/models/Transaction';
import User from '@/app/models/User';
import { Affiliate } from '@/app/models/Affiliate';
import { Commission } from '@/app/models/Commission';
import { Agent, ALL_SCOPES, DEFAULT_SCOPES } from '@/app/models/Agent';
import { AgentClaim } from '@/app/models/AgentClaim';

// Export all models for convenience
export {
    Item,
    Listing,
    SharedLink,
    Transaction,
    User,
    Affiliate,
    Commission,
    Agent,
    AgentClaim,
    ALL_SCOPES,
    DEFAULT_SCOPES
};
export type { Scope } from '@/app/models/Agent';

