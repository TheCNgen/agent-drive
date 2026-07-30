'use client';
import { useAgent } from '@/app/hooks/useAgent';
import { formatHbarWithUnit, formatRelative, truncateAddress } from '@/app/lib/agents/format';
import AgentStatusPill from './AgentStatusPill';
import CopyButton from './CopyButton';
import AgentPolicies from './AgentPolicies';
import AgentDangerZone from './AgentDangerZone';
import Loader from '@/app/components/global/Loader';
import { MdClose } from 'react-icons/md';

interface AgentDetailModalProps {
  agentId: string;
  isOpen: boolean;
  onClose: () => void;
  onRefetchList: () => void;
}

export default function AgentDetailModal({ agentId, isOpen, onClose, onRefetchList }: AgentDetailModalProps) {
  const { data, loading, error } = useAgent(agentId);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="flex flex-col bg-amber-100 border-2 border-black brutal-shadow-left w-[90vw] h-[85vh] m-auto">
        <div className="p-4 border-b-2 border-black bg-white flex items-center justify-between shrink-0">
          <div>
            <div className="text-sm text-gray-500 font-freeman mb-1">
              Dashboard / Agents / {data?.agent?.name || 'Loading...'}
            </div>
            {data && (
              <div className="flex items-center gap-4">
                <h2 className="font-anton text-2xl">{data.agent.name}</h2>
                <AgentStatusPill state={data.agent.onboardingState} />
                {data.wallet?.evmAddress && (
                  <div className="flex items-center gap-1 font-mono text-sm bg-gray-100 px-2 py-1 border-2 border-black">
                    {truncateAddress(data.wallet.evmAddress)}
                    <CopyButton text={data.wallet.evmAddress} />
                  </div>
                )}
              </div>
            )}
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <MdClose className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 overflow-auto bg-white p-6">
          {loading ? (
            <div className="flex justify-center py-12"><Loader /></div>
          ) : error ? (
            <div className="text-red-500 font-freeman">Error loading agent: {error.message}</div>
          ) : data ? (
            <div className="max-w-5xl mx-auto space-y-8">
              {/* Header Data Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-green-100 border-2 border-black brutal-shadow-left p-4 text-center">
                  <h3 className="font-anton text-2xl">{formatHbarWithUnit(data.agent.stats.totalSpentTinybars)}</h3>
                  <p className="font-freeman text-sm">Total spent</p>
                  <p className="text-xs text-gray-600 mt-1">Lifetime, across {data.agent.stats.purchasesSucceeded} orders</p>
                </div>
                <div className="bg-blue-100 border-2 border-black brutal-shadow-left p-4 text-center">
                  <h3 className="font-anton text-2xl">{data.agent.stats.purchasesSucceeded}</h3>
                  <p className="font-freeman text-sm">Files purchased</p>
                  <p className="text-xs text-gray-600 mt-1">
                    {data.agent.stats.successRate !== null ? `${data.agent.stats.successRate}% success` : '—'}
                  </p>
                </div>
                <div className="bg-yellow-100 border-2 border-black brutal-shadow-left p-4 text-center">
                  <h3 className="font-anton text-2xl">{formatHbarWithUnit(data.wallet.balanceTinybars)}</h3>
                  <p className="font-freeman text-sm">Balance</p>
                  <p className="text-xs text-gray-600 mt-1" title="HBAR only on Hedera testnet">
                    USDC —
                  </p>
                </div>
                <div className="bg-purple-100 border-2 border-black brutal-shadow-left p-4 text-center">
                  <h3 className="font-anton text-2xl">{formatRelative(data.agent.lastSeenAt)}</h3>
                  <p className="font-freeman text-sm">Last active</p>
                  <p className="text-xs text-gray-600 mt-1">
                    {data.wallet.network} · {data.wallet.accountId ?? 'No account yet'}
                  </p>
                </div>
              </div>

              <p className="text-xs text-gray-500 italic text-center">
                Spend is settled to the platform treasury; seller and affiliate amounts are ledger entries pending payout.
              </p>

              {/* Controls */}
              <div className="space-y-6 pt-4">
                <h3 className="font-anton text-2xl">Controls</h3>
                
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <div>
                    <h4 className="font-freeman text-lg font-bold mb-4">Spending Limits & Policies</h4>
                    <AgentPolicies agent={data.agent} />
                  </div>
                  <div>
                    <AgentDangerZone agent={data.agent} onClose={onClose} onRefetchList={onRefetchList} />
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
