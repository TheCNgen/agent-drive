import type { OnboardingState } from '@/app/lib/agents/types';

export default function AgentStatusPill({ state }: { state: OnboardingState }) {
  let label = '';
  let colorClass = '';

  switch (state) {
    case 'waiting':
      label = 'Awaiting setup';
      colorClass = 'bg-gray-100 text-gray-800';
      break;
    case 'claimed':
      label = 'Setting up';
      colorClass = 'bg-blue-100 text-blue-800';
      break;
    case 'wallet':
      label = 'Awaiting deposit';
      colorClass = 'bg-purple-100 text-purple-800';
      break;
    case 'funded':
      label = 'Activating';
      colorClass = 'bg-blue-100 text-blue-800';
      break;
    case 'active':
      label = 'Active';
      colorClass = 'bg-green-100 text-green-800';
      break;
    case 'expired':
      label = 'Expired';
      colorClass = 'bg-gray-100 text-gray-800';
      break;
    case 'revoked':
      label = 'Revoked';
      colorClass = 'bg-red-100 text-red-800';
      break;
    default:
      label = state;
      colorClass = 'bg-gray-100';
  }

  return (
    <span className={`px-3 py-1 text-xs font-freeman border-2 border-black ${colorClass}`}>
      {label}
    </span>
  );
}
