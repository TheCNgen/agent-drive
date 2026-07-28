import fs from 'fs';

async function test() {
  const cookieData = JSON.parse(fs.readFileSync('tests/.auth/seller.json', 'utf8'));
  const cookies = cookieData.cookies.map((c: any) => `${c.name}=${c.value}`).join('; ');
  
  const res = await fetch('http://localhost:3000/api/items?parentId=6a647ffaf187ddb7666bd83d', {
    method: 'GET',
    headers: {
      cookie: cookies
    }
  });
  console.log(res.status);
  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));
}
test();
