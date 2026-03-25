const fs = require('fs');
const path = require('path');

const inputPath = path.join(process.env.USERPROFILE, '.claude', 'projects', 'C--Users-beesc-pro-keirin', '9372a2cc-3bb4-48d7-87e7-ec95baf2bb1b', 'tool-results', 'mcp-supabase-execute_sql-1774272476401.txt');
const outputPath = path.join(__dirname, '..', 'docs', 'violations-72-2.csv');

const raw = fs.readFileSync(inputPath, 'utf-8');
const data = JSON.parse(raw);
const text = data[0].text;
const start = text.indexOf('[{"');
const end = text.lastIndexOf('"}]') + 3;
const result = JSON.parse(text.substring(start, end));

const header = 'name,date,round,day,race_no,back_no,violation_time,violation_place,article,paragraph,clause,judgment';
const lines = [header];
for (const r of result) {
  lines.push([r.name, r.date, r.round, r.day, r.race_no, r.back_no, r.violation_time, r.violation_place, r.article, r.paragraph, r.clause, r.judgment].join(','));
}
fs.writeFileSync(outputPath, lines.join('\n'), 'utf-8');
console.log(`총 ${result.length}건 CSV 저장: ${outputPath}`);
lines.slice(0, 11).forEach(l => console.log(l));
console.log('...');
lines.slice(-5).forEach(l => console.log(l));
