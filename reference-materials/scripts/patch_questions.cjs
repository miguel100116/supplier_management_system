const fs = require('fs');

const subQuestions = JSON.parse(fs.readFileSync('reference-materials/extracted/subQuestions.json', 'utf8'));
const supQuestions = JSON.parse(fs.readFileSync('reference-materials/extracted/supQuestions.json', 'utf8'));

let content = fs.readFileSync('src/hooks/useSurveyData.ts', 'utf8');

const supStart = content.indexOf('const supplierQuestions =');
const supEndStr = 'const subcontractorQuestions =';
const supEnd = content.indexOf(supEndStr);
const subEndStr = 'loadedSurveys = [';
const subEnd = content.indexOf(subEndStr);

if (supStart > -1 && supEnd > -1 && subEnd > -1) {
  const newSup = 'const supplierQuestions = ' + JSON.stringify(supQuestions, null, 2) + ';\n          ';
  const newSub = 'const subcontractorQuestions = ' + JSON.stringify(subQuestions, null, 2) + ';\n\n          ';
  
  content = content.substring(0, supStart) + newSup + newSub + content.substring(subEnd);
  fs.writeFileSync('src/hooks/useSurveyData.ts', content);
  console.log("Patched successfully!");
} else {
  console.log("Failed to find boundaries in useSurveyData.ts");
}
