import { useState } from 'react';

export default function AgentDangerZone({ agent, onClose, onRefetchList }: { agent: any, onClose: () => void, onRefetchList: () => void }) {
  const [loading, setLoading] = useState(false);
  
  const handleSuspend = async () => {
    if (!confirm(agent.status === 'suspended' ? 'Reactivate this agent?' : 'Suspend this agent?')) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/agents/${agent.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: agent.status === 'suspended' ? 'active' : 'suspended' }),
      });
      if (res.ok) {
        onRefetchList();
        onClose();
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete (revoke) this agent?')) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/agents/${agent.id}`, { method: 'DELETE' });
      if (res.ok) {
        onRefetchList();
        onClose();
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="border-2 border-red-200 bg-red-50 p-4 font-freeman">
      <h4 className="text-red-800 font-bold mb-4">Danger Zone</h4>
      <div className="flex gap-4">
        <button 
          onClick={handleSuspend}
          disabled={loading || agent.status === 'revoked'} 
          className="border-2 border-red-300 bg-white text-red-600 px-4 py-2 hover:bg-red-100 disabled:opacity-50"
        >
          {agent.status === 'suspended' ? 'Reactivate agent' : 'Suspend agent'}
        </button>
        <button 
          onClick={handleDelete}
          disabled={loading || agent.status === 'revoked'} 
          className="bg-red-500 text-white px-4 py-2 hover:bg-red-600 disabled:opacity-50"
        >
          Delete agent
        </button>
      </div>
    </div>
  );
}
