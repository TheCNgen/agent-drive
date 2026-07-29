import { useState, useEffect } from 'react';
import ClaimCommandBlock from './ClaimCommandBlock';
import OnboardingStepper from './OnboardingStepper';
import Loader from '@/app/components/global/Loader';

interface NewAgentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAgentCreated: () => void;
  initialAgentId?: string | null; // For "Resume setup"
}

export default function NewAgentModal({ isOpen, onClose, onAgentCreated, initialAgentId }: NewAgentModalProps) {
  const [name, setName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // State B & C
  const [agentId, setAgentId] = useState<string | null>(initialAgentId || null);
  const [claimCode, setClaimCode] = useState<string | null>(null);
  const [claimExpiresAt, setClaimExpiresAt] = useState<string | null>(null);
  const [alreadyClaimed, setAlreadyClaimed] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (!initialAgentId) {
        setName('');
        setAgentId(null);
        setClaimCode(null);
        setClaimExpiresAt(null);
        setAlreadyClaimed(false);
        setError(null);
      } else {
        setAgentId(initialAgentId);
        // We do not have the claim code if resuming.
        setClaimCode(null);
      }
    }
  }, [isOpen, initialAgentId]);

  // For auto-closing on active
  useEffect(() => {
  }, []);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !/^[A-Za-z0-9 _-]+$/.test(name) || name.length > 64) {
      setError('Label must be 1-64 characters and contain only letters, numbers, spaces, underscores, or hyphens.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() })
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) {
          window.location.href = '/auth/signin';
          return;
        }
        throw new Error(data.error || 'Failed to create agent');
      }

      setAgentId(data.agent.id);
      setClaimCode(data.claimCode);
      setClaimExpiresAt(data.claimExpiresAt);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRegenerate = async () => {
    if (!agentId) return;
    try {
      const res = await fetch(`/api/agents/${agentId}/claim`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        if (data.code === 'already_claimed') {
          setAlreadyClaimed(true);
        } else {
          throw new Error(data.error || 'Failed to regenerate code');
        }
        return;
      }
      setClaimCode(data.claimCode);
      setClaimExpiresAt(data.claimExpiresAt);
      setAlreadyClaimed(false);
    } catch (err: any) {
      console.error(err);
    }
  };

  // State A
  if (!agentId) {
    return (
      <div className="fixed inset-0 bg-black/90 backdrop-blur-sm bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-amber-100 border-2 border-black brutal-shadow-left w-full max-w-md">
          <div className="p-6 border-b-2 border-black flex items-center justify-between">
            <h2 className="font-anton text-3xl">New Agent</h2>
            <button onClick={onClose} className="text-2xl hover:text-gray-600">×</button>
          </div>
          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            <div>
              <label className="font-freeman block mb-2">Label</label>
              <input
                type="text"
                autoFocus
                value={name}
                onChange={(e) => { setName(e.target.value); setError(null); }}
                placeholder="drive-bot-1"
                className="w-full px-3 py-2 bg-white border-2 border-black font-freeman focus:outline-none focus:border-primary brutal-shadow-center"
              />
              {error && <p className="mt-2 text-sm text-red-600 font-freeman">{error}</p>}
            </div>
            <div className="flex justify-end pt-4">
              <button
                type="submit"
                disabled={isSubmitting || !name.trim()}
                className="button-primary bg-[#FFD000] px-6 py-2 flex items-center gap-2 disabled:opacity-50"
              >
                {isSubmitting ? <Loader /> : 'Create agent'}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // State B & C
  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-sm bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-amber-100 border-2 border-black brutal-shadow-left w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b-2 border-black flex items-center justify-between sticky top-0 bg-amber-100 z-10">
          <h2 className="font-anton text-3xl">Setup Agent</h2>
          <button onClick={() => { onAgentCreated(); onClose(); }} className="text-2xl hover:text-gray-600">×</button>
        </div>
        <div className="p-6 space-y-6">
          {alreadyClaimed ? (
            <div className="bg-yellow-50 p-4 border-2 border-black brutal-shadow-left">
              <p className="font-freeman text-yellow-800">The agent already redeemed a code — setup is in progress.</p>
            </div>
          ) : claimCode && claimExpiresAt ? (
            <ClaimCommandBlock
              claimCode={claimCode}
              expiresAt={claimExpiresAt}
              onExpired={() => {}} // Stepper handles expired state via SSE too
              onRegenerate={handleRegenerate}
            />
          ) : (
            <div className="bg-white p-4 border-2 border-black">
              <button onClick={handleRegenerate} className="button-primary bg-[#FFD000] px-4 py-2 text-sm">
                Regenerate code
              </button>
            </div>
          )}

          <div className="bg-white border-2 border-black p-6">
            <OnboardingStepper 
              agentId={agentId} 
              onRegenerate={handleRegenerate} 
              onActive={() => {
                setTimeout(() => {
                  onAgentCreated();
                  onClose();
                }, 1200);
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
