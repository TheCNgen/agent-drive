'use client';
import { useState, useEffect } from 'react';

export default function AgentPolicies({ agent }: { agent: any }) {
  const [dailyLimit, setDailyLimit] = useState(false);
  const [dailyVal, setDailyVal] = useState('10');
  const [monthlyLimit, setMonthlyLimit] = useState(false);
  const [monthlyVal, setMonthlyVal] = useState('100');
  const [orderLimit, setOrderLimit] = useState(false);
  const [orderVal, setOrderVal] = useState('5');
  const [approvalLimit, setApprovalLimit] = useState(false);
  const [approvalVal, setApprovalVal] = useState('20');
  
  const [scopes, setScopes] = useState<string[]>([]);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (agent?.spendingLimits) {
      if (agent.spendingLimits.dailyLimitHbar !== null) { setDailyLimit(true); setDailyVal(agent.spendingLimits.dailyLimitHbar.toString()); }
      if (agent.spendingLimits.monthlyLimitHbar !== null) { setMonthlyLimit(true); setMonthlyVal(agent.spendingLimits.monthlyLimitHbar.toString()); }
      if (agent.spendingLimits.orderLimitHbar !== null) { setOrderLimit(true); setOrderVal(agent.spendingLimits.orderLimitHbar.toString()); }
      if (agent.spendingLimits.approvalLimitHbar !== null) { setApprovalLimit(true); setApprovalVal(agent.spendingLimits.approvalLimitHbar.toString()); }
    }
    if (agent?.scopes) {
      setScopes(agent.scopes);
    }
  }, [agent]);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await fetch(`/api/agents/${agent.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          spendingLimits: {
            dailyLimitHbar: dailyLimit ? Number(dailyVal) : null,
            monthlyLimitHbar: monthlyLimit ? Number(monthlyVal) : null,
            orderLimitHbar: orderLimit ? Number(orderVal) : null,
            approvalLimitHbar: approvalLimit ? Number(approvalVal) : null,
          },
          scopes
        }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-3 font-freeman">
        <div className="flex items-center justify-between border-b pb-2">
          <div><div>Daily spending limit</div></div>
          <div className="flex items-center gap-4">
            {dailyLimit && (
              <div className="flex items-center gap-2">
                <input type="number" value={dailyVal} onChange={(e) => setDailyVal(e.target.value)} className="border-2 border-black p-1 w-20 text-right" />
                <span>ℏ</span>
              </div>
            )}
            <input type="checkbox" checked={dailyLimit} onChange={(e) => setDailyLimit(e.target.checked)} className="w-5 h-5 accent-black" />
          </div>
        </div>

        <div className="flex items-center justify-between border-b pb-2">
          <div><div>Monthly spending limit</div></div>
          <div className="flex items-center gap-4">
            {monthlyLimit && (
              <div className="flex items-center gap-2">
                <input type="number" value={monthlyVal} onChange={(e) => setMonthlyVal(e.target.value)} className="border-2 border-black p-1 w-20 text-right" />
                <span>ℏ</span>
              </div>
            )}
            <input type="checkbox" checked={monthlyLimit} onChange={(e) => setMonthlyLimit(e.target.checked)} className="w-5 h-5 accent-black" />
          </div>
        </div>

        <div className="flex items-center justify-between border-b pb-2">
          <div><div>Per-order limit</div></div>
          <div className="flex items-center gap-4">
            {orderLimit && (
              <div className="flex items-center gap-2">
                <input type="number" value={orderVal} onChange={(e) => setOrderVal(e.target.value)} className="border-2 border-black p-1 w-20 text-right" />
                <span>ℏ</span>
              </div>
            )}
            <input type="checkbox" checked={orderLimit} onChange={(e) => setOrderLimit(e.target.checked)} className="w-5 h-5 accent-black" />
          </div>
        </div>

        <div className="flex items-center justify-between border-b pb-2">
          <div>
            <div>Require approval above</div>
            <div className="text-xs text-gray-500">Purchases over this amount need your approval before the agent can complete them.</div>
          </div>
          <div className="flex items-center gap-4">
            {approvalLimit && (
              <div className="flex items-center gap-2">
                <input type="number" value={approvalVal} onChange={(e) => setApprovalVal(e.target.value)} className="border-2 border-black p-1 w-20 text-right" />
                <span>ℏ</span>
              </div>
            )}
            <input type="checkbox" checked={approvalLimit} onChange={(e) => setApprovalLimit(e.target.checked)} className="w-5 h-5 accent-black" />
          </div>
        </div>
      </div>
      
      <div className="space-y-3 font-freeman mt-6">
        <h4 className="font-freeman text-lg font-bold mb-4">Capabilities (Scopes)</h4>
        <div className="flex items-center justify-between border-b pb-2">
          <div>
            <div>Allow Purchases</div>
            <div className="text-xs text-gray-500">Grants the <code>payments:spend</code> scope, allowing the agent to buy listings and shared links.</div>
          </div>
          <div className="flex items-center gap-4">
            <input 
              type="checkbox" 
              checked={scopes.includes('payments:spend')} 
              onChange={(e) => {
                if (e.target.checked) {
                  setScopes([...scopes, 'payments:spend']);
                } else {
                  setScopes(scopes.filter(s => s !== 'payments:spend'));
                }
              }} 
              className="w-5 h-5 accent-black" 
            />
          </div>
        </div>
      </div>
      
      <div className="flex items-center gap-4 mt-6">
        <button onClick={handleSave} disabled={saving} className="bg-black text-white px-4 py-2 font-freeman hover:bg-gray-800 disabled:opacity-50">
          {saving ? 'Saving...' : 'Save Policies'}
        </button>
        {saved && <span className="text-green-600 font-freeman text-sm">Saved!</span>}
      </div>
    </div>
  );
}
