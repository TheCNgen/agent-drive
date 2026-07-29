import { useState } from 'react';

export default function AgentPolicies() {
  const [dailyLimit, setDailyLimit] = useState(false);
  const [dailyVal, setDailyVal] = useState('10');
  
  const [monthlyLimit, setMonthlyLimit] = useState(false);
  const [monthlyVal, setMonthlyVal] = useState('100');
  
  const [orderLimit, setOrderLimit] = useState(false);
  const [orderVal, setOrderVal] = useState('5');
  
  const [approvalLimit, setApprovalLimit] = useState(false);
  const [approvalVal, setApprovalVal] = useState('20');

  return (
    <div className="space-y-4">
      <div className="bg-yellow-50 border border-yellow-200 p-3 rounded text-sm text-yellow-800 font-freeman">
        Display only — these controls are not yet enforced.
      </div>
      
      <div className="space-y-3 font-freeman">
        <div className="flex items-center justify-between border-b pb-2">
          <div>
            <div>Daily spending limit</div>
          </div>
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
          <div>
            <div>Monthly spending limit</div>
          </div>
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
          <div>
            <div>Per-order limit</div>
          </div>
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
    </div>
  );
}
