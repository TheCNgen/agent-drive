import { Mistral } from '@mistralai/mistralai';
import fs from 'fs';
const apiKey = fs.readFileSync('/home/mac/credentials/.mistral_key', 'utf-8').trim();
const client = new Mistral({ apiKey });
async function run() {
  const content = Buffer.from("dummy pdf content");
  try {
    const uploaded = await client.files.upload({
      file: { fileName: "test.pdf", content: content },
      purpose: "ocr"
    });
    
    // Attempt 1: document_url with getSignedUrl
    const signedUrl = await client.files.getSignedUrl({ fileId: uploaded.id });
    console.log("signedUrl:", signedUrl.url);
    
    const res = await client.ocr.process({
      model: "mistral-ocr-latest",
      document: { type: "document_url", documentUrl: signedUrl.url }
    });
    console.log(res);
  } catch(e) {
    console.log(e);
  }
}
run();
