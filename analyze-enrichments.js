import fs from 'fs';

const data = JSON.parse(fs.readFileSync('page1-35-enrichments.json', 'utf8'));
const types = {};
data.enrichments.forEach(e => {
  types[e.type] = (types[e.type] || 0) + 1;
});

console.log("Enrichment types count:", types);
console.log("Sample enrichments of each type:");
const samples = {};
data.enrichments.forEach(e => {
  if (!samples[e.type]) samples[e.type] = e;
});
console.log(JSON.stringify(samples, null, 2));
