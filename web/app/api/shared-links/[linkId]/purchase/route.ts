import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json(
    { error: 'Only agents can make purchases directly on the platform now.' },
    { status: 403 }
  );
}
