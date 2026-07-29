import CopyButton from './CopyButton';
import { formatCountdown } from '@/app/lib/agents/format';
import { useEffect, useState } from 'react';

interface ClaimCommandBlockProps {
  claimCode: string;
  expiresAt: string;
  onExpired: () => void;
  onRegenerate: () => void;
}

export default function ClaimCommandBlock({ claimCode, expiresAt, onExpired, onRegenerate }: ClaimCommandBlockProps) {
  const [msRemaining, setMsRemaining] = useState(0);
  const [hasExpired, setHasExpired] = useState(false);
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  
  const instructionStr = `Read ${origin}/skill.md and set up this agent by running: npx -y cash-drive@latest onboard --claim ${claimCode} --base-url ${origin}`;

  useEffect(() => {
    const end = new Date(expiresAt).getTime();
    
    const update = () => {
      const now = Date.now();
      const remaining = end - now;
      if (remaining <= 0) {
        setMsRemaining(0);
        setHasExpired(true);
        onExpired();
      } else {
        setMsRemaining(remaining);
      }
    };
    
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [expiresAt, onExpired]);

  if (hasExpired) {
    return (
      <div className="bg-red-50 p-4 border-2 border-black brutal-shadow-left">
        <p className="font-freeman text-red-800 mb-2">This claim code has expired.</p>
        <button 
          onClick={onRegenerate}
          className="button-primary bg-white text-sm px-4 py-2"
        >
          Regenerate code
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="relative bg-gray-900 text-gray-100 p-4 font-mono text-sm rounded border-2 border-black break-all">
        <div className="pr-12">{instructionStr}</div>
        <div className="absolute top-2 right-2">
          <CopyButton text={instructionStr} className="text-white hover:text-gray-900 hover:bg-gray-100" />
        </div>
      </div>
      <p className="text-sm text-gray-500 font-freeman">
        Paste this into your agent's chat. The code expires in {formatCountdown(msRemaining)} and works once.
      </p>
    </div>
  );
}
