import type { AgentStateEvent, OnboardingState } from './types';

export const ONBOARD_STEPS = [
  { key: 'handshake', label: 'Waiting for agent handshake' },
  { key: 'claimed',   label: 'Claim redeemed' },
  { key: 'wallet',    label: 'Wallet created' },
  { key: 'deposit',   label: 'Awaiting deposit' },
  { key: 'funded',    label: 'Funded' },
  { key: 'active',    label: 'Active' },
] as const;

export type StepKey = typeof ONBOARD_STEPS[number]['key'];

/**
 * Index of the step currently in progress. Every earlier index is complete.
 * \`wallet\` covers two steps: 'Wallet created' completes the moment an EVM
 * address exists, and 'Awaiting deposit' becomes the live step.
 */
export function currentStepIndex(s: Pick<AgentStateEvent, 'onboardingState' | 'evmAddress'>): number {
  switch (s.onboardingState) {
    case 'waiting':  return 0;
    case 'claimed':  return 1;
    case 'wallet':   return s.evmAddress ? 3 : 2;
    case 'funded':   return 4;
    case 'active':   return 5;
    case 'expired':
    case 'revoked':  return -1; // terminal failure; the stepper is replaced by an error panel
  }
}

export const isTerminalFailure = (s: OnboardingState) => s === 'expired' || s === 'revoked';
export const isComplete = (s: OnboardingState) => s === 'active';
