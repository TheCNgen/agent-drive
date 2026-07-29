'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import AIOverlay from '../components/AI/AIOverlay';
import FloatingAIBot from '../components/AI/FloatingAIBot';
import FooterPattern from '../components/global/FooterPattern';
import { formatHbarWithUnit, formatBytes } from '@/app/lib/agents/format';
import type { DashboardSummary } from '@/app/lib/agents/types';

import FilesTab from './_components/tabs/FilesTab';
import AgentsTab from './_components/tabs/AgentsTab';
import AuditTab from './_components/tabs/AuditTab';

function DashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTab = searchParams.get('tab') || 'files';
  
  const [isAIOpen, setIsAIOpen] = useState(false);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);

  useEffect(() => {
    fetch('/api/agents/summary')
      .then(res => res.json())
      .then(data => {
        if (data && !data.error) {
          setSummary(data);
        }
      })
      .catch(console.error);
  }, []);

  const toggleAI = () => setIsAIOpen(!isAIOpen);
  const closeAI = () => setIsAIOpen(false);

  const handleTabChange = (tab: string) => {
    router.replace(`?tab=${tab}`);
  };

  return (
    <>
      <main className="max-w-7xl mx-auto py-24 px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="text-center p-8 rounded-lg mb-4">
          <h2 className="heading-text-2 text-6xl font-anton">
            DASHBOARD
          </h2>
        </div>
        
        {!isAIOpen && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="bg-purple-100 border-2 border-black brutal-shadow-left p-4 text-center">
              <h3 className="font-anton text-2xl">{summary ? summary.agents.total : '—'}</h3>
              <p className="font-freeman text-sm">Agents</p>
              {summary && (
                <p className="text-xs text-gray-600 mt-1">
                  {summary.agents.active} active
                </p>
              )}
            </div>
            <div className="bg-green-100 border-2 border-black brutal-shadow-left p-4 text-center">
              <h3 className="font-anton text-2xl">{summary ? formatHbarWithUnit(summary.spend.totalTinybars) : '—'}</h3>
              <p className="font-freeman text-sm">Spend</p>
              {summary && (
                <p className="text-xs text-gray-600 mt-1">
                  {summary.spend.purchaseCount} orders
                </p>
              )}
            </div>
            <div className="bg-blue-100 border-2 border-black brutal-shadow-left p-4 text-center">
              <h3 className="font-anton text-2xl">{summary ? summary.files.count : '—'}</h3>
              <p className="font-freeman text-sm">Files</p>
              {summary && (
                <p className="text-xs text-gray-600 mt-1">
                  {formatBytes(summary.files.totalBytes)}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Tabs Bar */}
        <div className="flex border-2 border-black bg-white mb-6">
          <button
            onClick={() => handleTabChange('files')}
            className={`flex-1 px-6 py-3 font-freeman border-r-2 border-black ${activeTab === 'files' ? 'bg-[#FFD000]' : 'bg-white hover:bg-gray-50'}`}
          >
            Files
          </button>
          <button
            onClick={() => handleTabChange('agents')}
            className={`flex-1 px-6 py-3 font-freeman border-r-2 border-black ${activeTab === 'agents' ? 'bg-[#FFD000]' : 'bg-white hover:bg-gray-50'}`}
          >
            Agents
          </button>
          <button
            onClick={() => handleTabChange('audit')}
            className={`flex-1 px-6 py-3 font-freeman ${activeTab === 'audit' ? 'bg-[#FFD000]' : 'bg-white hover:bg-gray-50'}`}
          >
            Audit
          </button>
        </div>

        {/* Tab Panel */}
        <div className={`transition-all duration-300 ${isAIOpen ? 'mt-0' : ''}`}>
          {activeTab === 'files' && <FilesTab />}
          {activeTab === 'agents' && <AgentsTab />}
          {activeTab === 'audit' && <AuditTab />}
        </div>
      </main>
      
      <FooterPattern design={1} className='w-[80vw] bottom-0 right-0' />
      <FooterPattern design={1} className='w-[80vw] top-0 left-0 -scale-100' />
      
      <FloatingAIBot onToggle={toggleAI} isOpen={isAIOpen} />
      <AIOverlay isOpen={isAIOpen} onClose={closeAI} />
    </>
  );
}

export default function Dashboard() {
  return (
    <div className="min-h-screen bg-white relative">
      <Suspense fallback={<div />}>
        <DashboardContent />
      </Suspense>
    </div>
  );
}