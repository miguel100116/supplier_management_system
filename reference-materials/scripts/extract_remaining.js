import fs from 'fs';
import path from 'path';

const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = 'gemini-flash-lite-latest';
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;

async function extractTextFromImage(filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  const base64Data = fileBuffer.toString('base64');

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: "This is an image of a Microsoft Form survey question page. Please extract: 1. The question number. 2. The question text. 3. The description or instructions if any. 4. The option types (e.g. 0 to 4 ratings, choices, etc.) and options text. Be extremely accurate and preserve the exact spelling and casing." },
            {
              inlineData: {
                mimeType: "image/png",
                data: base64Data
              }
            }
          ]
        }]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`HTTP Error ${response.status}: ${errText}`);
    }

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "No text extracted.";
  } catch (error) {
    console.error(`Error processing ${filePath}:`, error.message);
    return `ERROR processing ${filePath}: ${error.message}`;
  }
}

async function runRemaining() {
  const tasks = [
    // Courier remaining
    { cat: 'courier', files: ['5.png', '6.png'] },
    // Subcontractor remaining
    { cat: 'subcontractor', files: ['1.png', '2.png', '3.png', '4.png', '5.png', '6.png', '7.png', '8.png', '9.png'] },
    // Supplier remaining
    { cat: 'supplier', files: ['1.png', '2.png', '3.png', '4.png', '5.png', '6.png'] }
  ];

  for (const task of tasks) {
    const outputFile = `./reference-materials/extracted/extracted_${task.cat}.txt`;
    console.log(`Processing remaining files for category: ${task.cat}`);

    // If file doesn't exist, initialize it
    if (!fs.existsSync(outputFile)) {
      fs.writeFileSync(outputFile, `EXTRACTED ${task.cat.toUpperCase()} QUESTIONS\n========================\n\n`);
    }

    for (const file of task.files) {
      const filePath = path.join('./reference-materials/source-data/screenshots', task.cat, file);
      console.log(`  Processing file: ${filePath}...`);
      const extracted = await extractTextFromImage(filePath);
      
      fs.appendFileSync(outputFile, `\n\nFILE: ${file}\n${extracted}\n`);
      
      // Pause for 15 seconds to avoid per-minute rate limits (5 requests per minute limit)
      await new Promise(resolve => setTimeout(resolve, 15000));
    }
  }

  console.log('Finished extraction of all remaining files!');
}

runRemaining().catch(console.error);
