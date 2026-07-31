'use client';

import { useState, useEffect } from 'react';
import Loader from '@/app/components/global/Loader';

interface AuditLog {
  sequenceNumber: number;
  consensusTimestamp: string;
  event: string;
  timestamp: number;
  [key: string]: any;
}

export default function AuditTab() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const response = await fetch('/api/audit');
        if (!response.ok) {
          throw new Error('Failed to fetch audit logs');
        }
        const data = await response.json();
        setLogs(data.logs || []);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchLogs();
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <Loader />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-100 border-2 border-red-300 p-8 text-center brutal-shadow-left">
        <p className="font-freeman text-lg text-red-700">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white border-2 border-black p-6 brutal-shadow-left">
        <h2 className="font-anton text-2xl mb-2">IMMUTABLE AUDIT LOG</h2>
        <p className="font-freeman text-gray-600">
          Powered by Hedera Consensus Service. This is a cryptographically verified, tamper-proof record of all critical events relevant to your account.
        </p>
      </div>

      {logs.length === 0 ? (
        <div className="bg-white border-2 border-black brutal-shadow-left p-12 text-center">
          <p className="font-freeman text-lg text-gray-600">No audit logs found yet.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {logs.map((log) => (
            <div key={log.sequenceNumber} className="bg-white border-2 border-black p-4 brutal-shadow-left hover:-translate-y-1 hover:-translate-x-1 transition-transform">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <span className="px-3 py-1 bg-[#8544FA] border-2 border-black font-anton text-sm inline-block">
                    {log.event.replace(/_/g, ' ')}
                  </span>
                </div>
                <div className="text-right">
                  <p className="font-freeman text-sm text-gray-500">
                    {new Date(log.timestamp).toLocaleString()}
                  </p>
                  <a 
                    href={`https://hashscan.io/testnet/transaction/${log.consensusTimestamp}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-freeman text-xs text-blue-600 hover:underline inline-block mt-1"
                  >
                    View on Hashscan ↗
                  </a>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t-2 border-gray-100">
                <pre className="font-mono text-xs overflow-x-auto text-gray-700">
                  {JSON.stringify(
                    Object.fromEntries(
                      Object.entries(log).filter(
                        ([key]) => !['sequenceNumber', 'consensusTimestamp', 'event', 'timestamp'].includes(key)
                      )
                    ), 
                    null, 
                    2
                  )}
                </pre>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
