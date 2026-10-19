import fs from 'fs';
import path from 'path';

const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = 'gemini-flash-latest';
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;

async function extractTextFromImage(filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  const base64Data = fileBuffer.toString('base64');

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
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

async function main() {
  const baseDir = './reference-materials/source-data/screenshots';
  const targetCat = process.argv[2]; // e.g. 'courier', 'subcontractor', 'supplier'
  const categories = targetCat ? [targetCat] : ['courier', 'subcontractor', 'supplier'];
  
  const outputFile = targetCat ? `./reference-materials/extracted/extracted_${targetCat}.txt` : './reference-materials/extracted/extracted_form_text.txt';
  fs.writeFileSync(outputFile, `EXTRACTED ${targetCat ? targetCat.toUpperCase() : "FORM"} QUESTIONS\n========================\n\n`);

  for (const cat of categories) {
    console.log(`Processing category: ${cat}`);
    fs.appendFileSync(outputFile, `\nCATEGORY: ${cat.toUpperCase()}\n------------------------\n`);
    const catDir = path.join(baseDir, cat);
    if (!fs.existsSync(catDir)) {
      console.log(`Directory does not exist: ${catDir}`);
      continue;
    }

    const files = fs.readdirSync(catDir)
      .filter(f => f.endsWith('.png'))
      .sort((a, b) => parseInt(a) - parseInt(b)); // sort 1.png, 2.png, etc.

    for (const file of files) {
      const filePath = path.join(catDir, file);
      console.log(`  Processing file: ${file}...`);
      const extracted = await extractTextFromImage(filePath);
      fs.appendFileSync(outputFile, `\nFILE: ${file}\n${extracted}\n`);
      // Pause for 15 seconds to be nice to rate limits (5 requests per minute limit)
      await new Promise(resolve => setTimeout(resolve, 15000));
    }
  }

  console.log(`Finished extraction! Saved to ${outputFile}`);
}

main().catch(console.error);
