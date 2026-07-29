import { useAgentEvents } from '@/app/hooks/useAgentEvents';
import { ONBOARD_STEPS, currentStepIndex } from '@/app/lib/agents/steps';
import { formatHbarWithUnit } from '@/app/lib/agents/format';
import { MdCheck } from 'react-icons/md';
import CopyButton from './CopyButton';
import { useEffect } from 'react';

interface OnboardingStepperProps {
  agentId: string;
  onRegenerate: () => void;
  onActive?: () => void;
}

export default function OnboardingStepper({ agentId, onRegenerate, onActive }: OnboardingStepperProps) {
  const { state, transport, expired, error } = useAgentEvents(agentId);

  useEffect(() => {
    if (state?.onboardingState === 'active' && onActive) {
      onActive();
    }
  }, [state?.onboardingState, onActive]);

  if (error || expired || state?.onboardingState === 'expired') {
    return (
      <div className="bg-red-50 p-4 border-2 border-black brutal-shadow-left mt-6">
        <p className="font-freeman text-red-800 mb-2">This claim code expired before the agent used it.</p>
        <button onClick={onRegenerate} className="button-primary bg-white text-sm px-4 py-2">
          Regenerate code
        </button>
      </div>
    );
  }

  if (state?.status === 'revoked' || state?.onboardingState === 'revoked') {
    return (
      <div className="bg-red-50 p-4 border-2 border-black brutal-shadow-left mt-6">
        <p className="font-freeman text-red-800">This agent was revoked.</p>
      </div>
    );
  }

  const currentIndex = state ? currentStepIndex(state) : 0;

  return (
    <div className="mt-8 space-y-4">
      <h3 className="font-anton text-xl mb-4">Live setup progress</h3>
      
      {transport === 'polling' && (
        <p className="text-sm text-gray-500 font-freeman mb-4">Live updates reconnected via polling.</p>
      )}

      <div className="space-y-4">
        {ONBOARD_STEPS.map((step, idx) => {
          const isComplete = idx < currentIndex;
          const isCurrent = idx === currentIndex;
          const isPending = idx > currentIndex;

          return (
            <div key={step.key} className="flex flex-col gap-2">
              <div className="flex items-center gap-3">
                <div className={`w-6 h-6 rounded-full border-2 border-black flex items-center justify-center shrink-0 ${isComplete ? 'bg-green-400' : isCurrent ? 'bg-blue-400' : 'bg-gray-100'}`}>
                  {isComplete && <MdCheck className="text-black" />}
                  {isCurrent && <div className="w-2 h-2 bg-black rounded-full animate-ping" />}
                </div>
                <span className={`font-freeman ${isPending || isComplete ? 'text-gray-500' : 'text-black'}`}>
                  {step.label}
                </span>
              </div>

              {/* Step details for current step */}
              {isCurrent && state && (
                <div className="ml-9 pl-4 border-l-2 border-gray-200">
                  {step.key === 'handshake' && <p className="text-sm">Waiting for the agent to run the command…</p>}
                  {step.key === 'claimed' && <p className="text-sm">API key issued to the agent.</p>}
                  {step.key === 'wallet' && <p className="text-sm">Generating a local wallet on the agent's host…</p>}
                  {step.key === 'deposit' && state.evmAddress && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 font-mono text-sm bg-gray-100 p-2 border-2 border-black">
                        <span className="truncate">{state.evmAddress}</span>
                        <CopyButton text={state.evmAddress} />
                      </div>
                      <p className="text-sm">
                        Send at least 1 ℏ to activate this wallet. We suggest {formatHbarWithUnit(state.suggestedFundingTinybars)} to leave working balance for purchases.
                      </p>
                      <p className="text-xs text-gray-500">Hedera testnet · the private key never leaves the agent's machine.</p>
                    </div>
                  )}
                  {step.key === 'funded' && (
                    <p className="text-sm">Deposit detected — {formatHbarWithUnit(state.balanceTinybars)}. Completing the account…</p>
                  )}
                  {step.key === 'active' && <p className="text-sm">Setup complete.</p>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
