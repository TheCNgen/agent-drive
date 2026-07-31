'use client';

import { useState, useEffect } from 'react';

export default function SettingsTab() {
  const [wallet, setWallet] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetch('/api/users/me/payout-wallet')
      .then(res => res.json())
      .then(data => {
        if (data.payoutWallet) {
          setWallet(data.payoutWallet);
        }
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setMessage('');
    try {
      const res = await fetch('/api/users/me/payout-wallet', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payoutWallet: wallet }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage('Payout wallet saved successfully!');
      } else {
        setMessage(`Error: ${data.error}`);
      }
    } catch (err) {
      setMessage('Failed to save payout wallet.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white border-2 border-black p-6 brutal-shadow-left">
      <h2 className="font-anton text-3xl mb-4">Payout Settings</h2>
      <p className="font-freeman text-gray-700 mb-6 max-w-2xl">
        AgentDrive is now non-custodial! When you sell an item or earn affiliate commissions, the funds are deposited directly into a Smart Contract. Set your Hedera EVM Address below so you can claim your earnings.
      </p>

      {loading ? (
        <p className="font-freeman">Loading...</p>
      ) : (
        <div className="max-w-md">
          <label className="block font-freeman text-lg mb-2">Hedera EVM Address</label>
          <input
            type="text"
            className="w-full border-2 border-black p-3 font-mono text-sm mb-4"
            placeholder="0x..."
            value={wallet}
            onChange={(e) => setWallet(e.target.value)}
          />
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-[#8544FA] border-2 border-black px-6 py-2 font-freeman hover:bg-purple-400 disabled:opacity-50 brutal-shadow-sm transition-all active:translate-y-1 active:translate-x-1 active:shadow-none"
          >
            {saving ? 'Saving...' : 'Save Wallet'}
          </button>
          
          {message && (
            <p className={`mt-4 font-freeman ${message.includes('Error') || message.includes('Failed') ? 'text-red-500' : 'text-green-600'}`}>
              {message}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
