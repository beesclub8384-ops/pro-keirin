import * as fs from "fs";

async function main() {
  const html = fs.readFileSync("scripts/debug-dc-latest.html", "utf-8");

  // Find 진익남 and show surrounding HTML
  const idx = html.indexOf("진익남");
  console.log(`진익남 found at position ${idx}\n`);

  // Get the racer ID
  const before500 = html.substring(Math.max(0, idx - 500), idx);
  const racerIdMatch = before500.match(/fnRacer\.popup\([^)]*?(\d{8,})/);
  console.log(`Racer ID: ${racerIdMatch?.[1]}\n`);

  // Find the <tr> containing 진익남
  // Go backward to find <tr>
  let trStart = html.lastIndexOf("<tr", idx);
  // Go forward to find </tr>
  let trEnd = html.indexOf("</tr>", idx) + 5;

  // But this might be inside a nested structure - let's get a wider view
  // Show 3000 chars around 진익남 to see full context
  const context = html.substring(Math.max(0, idx - 2000), Math.min(html.length, idx + 2000));

  // Find ALL <tr> tags in this context and show the one containing 진익남
  const trBlocks = context.split(/<tr/);
  for (let i = 0; i < trBlocks.length; i++) {
    if (trBlocks[i].includes("진익남")) {
      console.log(`=== TR block containing 진익남 (block ${i}) ===`);
      console.log(`<tr${trBlocks[i]}`);
      console.log("\n");
    }
  }

  // Now let's identify which TABLE this is in
  // Find the table start before 진익남
  let tableStart = html.lastIndexOf("<table", idx);
  let tableClassMatch = html.substring(tableStart, tableStart + 200).match(/class="([^"]*)"/);
  console.log(`=== Table class: ${tableClassMatch?.[1]} ===`);

  // Check what's between table start and 진익남
  const tableToJin = html.substring(tableStart, idx);

  // Is there a 선수정보 or 최근성적 comment?
  const hasEntryComment = tableToJin.includes("선수정보");
  const hasRecentComment = tableToJin.includes("최근성적") || tableToJin.includes("최근 ");
  console.log(`Contains "선수정보": ${hasEntryComment}`);
  console.log(`Contains "최근": ${hasRecentComment}`);

  // Show the table header row
  const headerMatch = html.substring(tableStart, tableStart + 2000).match(/<thead[\s\S]*?<\/thead>/);
  if (headerMatch) {
    console.log(`\nTable header:\n${headerMatch[0].replace(/\s+/g, " ").substring(0, 500)}`);
  }

  // Now show ALL <tr> rows that contain 진익남's racer ID
  const racerId = racerIdMatch?.[1] || "진익남";
  console.log(`\n\n=== ALL rows containing ${racerId} ===`);
  const allTrs = html.split(/<tr/);
  for (let i = 0; i < allTrs.length; i++) {
    if (allTrs[i].includes(racerId)) {
      const trContent = "<tr" + allTrs[i].substring(0, allTrs[i].indexOf("</tr>") + 5);
      console.log(`\n--- Row ${i} ---`);
      console.log(trContent);
    }
  }

  // Check: does any table with 진익남 have 결 장 in HER row?
  console.log(`\n\n=== 진익남 rows with 결 장? ===`);
  for (let i = 0; i < allTrs.length; i++) {
    if (allTrs[i].includes(racerId) && (allTrs[i].includes("결 장") || allTrs[i].includes("결장"))) {
      console.log(`YES! Row ${i} has both ${racerId} and 결장`);
    }
  }
}

main().catch(console.error);
