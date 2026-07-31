'use client';
import { useAgents } from '@/app/hooks/useAgents';
import AgentsList from '../agents/AgentsList';
import NewAgentModal from '../agents/NewAgentModal';
import AgentDetailModal from '../agents/AgentDetailModal';
import Loader from '@/app/components/global/Loader';
import { useState } from 'react';

export default function AgentsTab() {
  const { data: agents, loading, error, refetch } = useAgents();
  const [isNewAgentOpen, setIsNewAgentOpen] = useState(false);
  const [resumeAgentId, setResumeAgentId] = useState<string | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);

  const handleOpenNew = () => {
    setResumeAgentId(null);
    setIsNewAgentOpen(true);
  };

  const handleResume = (id: string) => {
    setResumeAgentId(id);
    setIsNewAgentOpen(true);
  };

  const handleAgentCreatedOrClosed = () => {
    setIsNewAgentOpen(false);
    setResumeAgentId(null);
    refetch();
  };

  if (error) {
    return (
      <div className="bg-red-50 border-2 border-red-300 p-8 text-center brutal-shadow-left">
        <p className="font-freeman text-lg text-red-700">Failed to load agents</p>
        <button onClick={refetch} className="mt-4 button-primary bg-white px-6 py-2">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-anton text-3xl">AGENTS</h2>
        <button
          onClick={handleOpenNew}
          className="button-primary bg-[#8544FA] px-6 py-2 text-lg flex items-center gap-2 duration-100"
        >
          + New agent
        </button>
      </div>

      {loading && !agents ? (
        <div className="flex justify-center py-12"><Loader /></div>
      ) : !agents || agents.length === 0 ? (
        <div className="bg-white border-2 border-black brutal-shadow-left p-12 text-center">
          <h3 className="font-anton text-3xl mb-4">No agents yet</h3>
          <p className="font-freeman text-lg text-gray-600 mb-6">
            Agents are non-custodial identities that can browse and buy files on your behalf. Create one to get started.
          </p>
          <button
            onClick={handleOpenNew}
            className="button-primary bg-[#8544FA] px-6 py-2 text-lg flex items-center justify-center mx-auto"
          >
            + New agent
          </button>
        </div>
      ) : (
        <AgentsList
          agents={agents}
          onSelectAgent={setSelectedAgentId}
          onResumeSetup={handleResume}
        />
      )}

      {isNewAgentOpen && (
        <NewAgentModal
          isOpen={isNewAgentOpen}
          onClose={() => setIsNewAgentOpen(false)}
          onAgentCreated={handleAgentCreatedOrClosed}
          initialAgentId={resumeAgentId}
        />
      )}

      {selectedAgentId && (
        <AgentDetailModal
          agentId={selectedAgentId}
          isOpen={true}
          onClose={() => setSelectedAgentId(null)}
          onRefetchList={refetch}
        />
      )}
    </div>
  );
}
