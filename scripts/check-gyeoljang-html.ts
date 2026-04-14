import * as fs from "fs";

async function main() {
  const url = "https://www.kcycle.or.kr/race/card/decision/2026/4/1";
  console.log(`Fetching ${url}...\n`);
  const res = await fetch(url);
  const html = await res.text();

  // 1. Search for 결장 in raw HTML
  const patterns = ["결장", "결 장", "absent", "scratch"];
  for (const pat of patterns) {
    const indices: number[] = [];
    let idx = html.indexOf(pat);
    while (idx !== -1) {
      indices.push(idx);
      idx = html.indexOf(pat, idx + 1);
    }
    console.log(`"${pat}": ${indices.length} occurrences`);
    for (const i of indices.slice(0, 3)) {
      const start = Math.max(0, i - 200);
      const end = Math.min(html.length, i + pat.length + 200);
      const context = html.substring(start, end).replace(/\n/g, "\\n");
      console.log(`  [${i}] ...${context}...\n`);
    }
  }

  // 2. Search for CSS classes with relevant keywords
  const classPatterns = html.match(/class="[^"]*"/g) || [];
  const uniqueClasses = [...new Set(classPatterns)].sort();
  console.log(`\n=== Unique CSS classes (${uniqueClasses.length}) ===`);
  for (const c of uniqueClasses) {
    if (c.match(/결|absent|scratch|del|disable|cancel|miss|out|withdraw|gray|line-through|none/i)) {
      console.log(`  MATCH: ${c}`);
    }
  }

  // 3. Check for strikethrough markup
  const delTags = (html.match(/<del[^>]*>/g) || []).length;
  const sTags = (html.match(/<s>/g) || []).length;
  const lineThrough = (html.match(/line-through/g) || []).length;
  console.log(`\n<del>: ${delTags}, <s>: ${sTags}, line-through: ${lineThrough}`);

  // 4. Save full HTML
  fs.writeFileSync("scripts/debug-dc-page.html", html, "utf-8");
  console.log(`\nFull HTML saved (${html.length} chars)`);
}

main().catch(console.error);
