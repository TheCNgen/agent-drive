import fs from 'fs';

async function test() {
  try {
    const res = await fetch('http://localhost:3000/api/listings', {
      method: 'GET'
    });
    console.log(res.status);
    const data = await res.json();
    console.log(data.listings?.length ? `Found ${data.listings.length} listings` : 'No listings');
  } catch (error) {
    console.error(error);
  }
}
test();
