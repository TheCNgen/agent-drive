import { Mistral } from '@mistralai/mistralai';
const client = new Mistral({ apiKey: process.env.MISTRAL_API_KEY });
console.log(Object.keys(client.ocr || {}));
