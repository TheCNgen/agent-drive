import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/backend/authConfig';
import connectDB from '@/app/lib/mongodb';
import User from '@/app/models/User';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();
    const user = await User.findById(session.user.id);
    
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({ payoutWallet: user.payoutWallet || '' });
  } catch (error) {
    console.error('Error fetching payout wallet:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { payoutWallet } = await request.json();
    
    if (typeof payoutWallet !== 'string') {
      return NextResponse.json({ error: 'Invalid payout wallet' }, { status: 400 });
    }

    await connectDB();
    
    const user = await User.findByIdAndUpdate(
      session.user.id,
      { payoutWallet },
      { new: true }
    );

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, payoutWallet: user.payoutWallet });
  } catch (error) {
    console.error('Error updating payout wallet:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
