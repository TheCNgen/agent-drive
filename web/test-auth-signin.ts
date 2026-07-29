import axios from 'axios';

async function testAuthSignIn() {
  try {
    const res = await axios.post('http://localhost:3000/api/auth/callback/credentials', {
      email: 'johnjames@example.com',
      password: 'password123',
    }, {
      headers: {
        'Content-Type': 'application/json'
      },
      validateStatus: () => true,
      maxRedirects: 0
    });
    console.log('Status:', res.status);
    console.log('Headers:', res.headers);
    console.log('Data:', res.data);
  } catch (err: any) {
    console.error('Error:', err.message);
  }
}

testAuthSignIn();
