import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/lib/backend/authConfig';
import { config } from '@/app/lib/config';

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;
    const topicId = config.hedera.provenanceTopicId;
    
    if (!topicId) {
      return NextResponse.json({ logs: [] });
    }

    const response = await fetch(`${config.hedera.mirrorNodeUrl}/api/v1/topics/${topicId}/messages?limit=100&order=desc`, { cache: 'no-store' });
    if (!response.ok) {
      return NextResponse.json({ logs: [] });
    }
    
    const data = await response.json();
    
    if (!data.messages) {
      return NextResponse.json({ logs: [] });
    }

    const logs = [];
    for (const msg of data.messages) {
      try {
        const decoded = Buffer.from(msg.message, 'base64').toString('utf8');
        const parsed = JSON.parse(decoded);
        
        // Filter by user ID
        const isRelevant = 
          parsed.owner === userId || 
          parsed.ownerId === userId ||
          parsed.buyerId === userId || 
          parsed.sellerId === userId ||
          parsed.buyer === userId ||
          parsed.seller === userId ||
          parsed.userId === userId ||
          parsed.agentId === userId;

        if (isRelevant) {
          logs.push({
            sequenceNumber: msg.sequence_number,
            consensusTimestamp: msg.consensus_timestamp,
            ...parsed
          });
        }
      } catch (e) {
        // Not a JSON message or not base64
      }
    }

    return NextResponse.json({ logs });

  } catch (error) {
    console.error('Audit API Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
