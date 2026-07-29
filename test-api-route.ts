import { GET } from './app/api/listings/route';
import { NextRequest } from 'next/server';

async function test() {
  const req = new NextRequest('http://localhost:3000/api/listings?status=active');
  const res = await GET(req);
  console.log(res.status);
  const text = await res.text();
  console.log(text);
}

test().catch(console.error);
