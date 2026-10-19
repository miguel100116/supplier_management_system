import fs from 'fs';

const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = 'gemini-flash-lite-latest';
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;

async function test() {
  const filePath = 'reference-materials/source-data/screenshots/supplier/6.png';
  console.log(`Processing test file: ${filePath}`);
  const fileBuffer = fs.readFileSync(filePath);
  const base64Data = fileBuffer.toString('base64');

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: "Extract the questions and text from this image." },
          { inlineData: { mimeType: "image/png", data: base64Data } }
        ]
      }]
    })
  });

  console.log('Response Status:', response.status);
  const data = await response.json();
  if (data.error) {
    console.log('Error details:', JSON.stringify(data.error, null, 2));
  } else {
    console.log('Extracted text successfully!');
    console.log(data.candidates?.[0]?.content?.parts?.[0]?.text);
  }
}

test().catch(console.error);
