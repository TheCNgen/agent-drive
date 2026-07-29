'use client';
import { formatHbarWithUnit, truncateAddress, formatRelative } from '@/app/lib/agents/format';
import type { AgentSummary } from '@/app/lib/agents/types';
import AgentStatusPill from './AgentStatusPill';
import CopyButton from './CopyButton';

interface AgentsListProps {
  agents: AgentSummary[];
  onSelectAgent: (agentId: string) => void;
  onResumeSetup: (agentId: string) => void;
}

export default function AgentsList({ agents, onSelectAgent, onResumeSetup }: AgentsListProps) {
  return (
    <div className="bg-white border-2 border-black brutal-shadow-left overflow-x-auto">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="border-b-2 border-black bg-gray-50">
            <th className="p-4 font-anton text-lg tracking-wider">NAME</th>
            <th className="p-4 font-anton text-lg tracking-wider">STATUS</th>
            <th className="p-4 font-anton text-lg tracking-wider">WALLET</th>
            <th className="p-4 font-anton text-lg tracking-wider">SPENT</th>
            <th className="p-4 font-anton text-lg tracking-wider">PURCHASES</th>
            <th className="p-4 font-anton text-lg tracking-wider">LAST ACTIVE</th>
            <th className="p-4 font-anton text-lg tracking-wider w-32"></th>
          </tr>
        </thead>
        <tbody className="font-freeman text-sm">
          {agents.map((agent, index) => {
            const needsResume = ['waiting', 'claimed', 'wallet', 'funded'].includes(agent.onboardingState);
            const isLast = index === agents.length - 1;

            return (
              <tr 
                key={agent.id} 
                className={`hover:bg-gray-50 transition-colors cursor-pointer ${!isLast ? 'border-b border-gray-200' : ''}`}
                onClick={() => onSelectAgent(agent.id)}
              >
                <td className="p-4">
                  <div className="font-bold text-base">{agent.name}</div>
                  <div className="text-gray-500 text-xs">Created {formatRelative(agent.createdAt)}</div>
                </td>
                <td className="p-4">
                  <AgentStatusPill state={agent.onboardingState} />
                </td>
                <td className="p-4 text-gray-600">
                  {agent.evmAddress ? (
                    <div className="flex items-center gap-1 font-mono text-xs">
                      {truncateAddress(agent.evmAddress)}
                      <div onClick={(e) => e.stopPropagation()}>
                        <CopyButton text={agent.evmAddress} />
                      </div>
                    </div>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="p-4">
                  {formatHbarWithUnit(agent.stats.totalSpentTinybars)}
                </td>
                <td className="p-4">
                  <div>{agent.stats.purchasesSucceeded}</div>
                  {agent.stats.successRate !== null && (
                    <div className="text-gray-500 text-xs">{agent.stats.successRate}% success</div>
                  )}
                </td>
                <td className="p-4 text-gray-500">
                  {formatRelative(agent.lastSeenAt)}
                </td>
                <td className="p-4 text-right">
                  {needsResume && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onResumeSetup(agent.id);
                      }}
                      className="text-[#FFD000] hover:text-yellow-600 font-bold underline px-2 py-1 transition-colors"
                    >
                      Resume setup
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
