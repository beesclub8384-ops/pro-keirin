import * as fs from "fs";

async function main() {
  // Fetch latest DC page: 2026/10/1
  const url = "https://www.kcycle.or.kr/race/card/decision/2026/10/1";
  console.log(`Fetching ${url}...\n`);
  const res = await fetch(url);
  const html = await res.text();
  console.log(`HTML size: ${html.length} chars\n`);

  // Save for inspection
  fs.writeFileSync("scripts/debug-dc-latest.html", html, "utf-8");

  // 1. Find all "결 장" and "결장" in the ENTIRE page
  const allGyeol = [...html.matchAll(/결 ?장/g)];
  console.log(`Total "결 장" or "결장" occurrences: ${allGyeol.length}\n`);

  // 2. Find 진익남
  const jinIdx = html.indexOf("진익남");
  if (jinIdx === -1) {
    console.log("진익남 not found on this page.");
    // Search other days
    for (const d of [2, 3]) {
      const url2 = `https://www.kcycle.or.kr/race/card/decision/2026/10/${d}`;
      const res2 = await fetch(url2);
      const html2 = await res2.text();
      if (html2.indexOf("진익남") !== -1) {
        console.log(`진익남 found on day ${d}!`);
      }
    }
    // Also search 2026/9/x
    for (const r of [9, 8, 7]) {
      for (const d of [1, 2, 3]) {
        const url2 = `https://www.kcycle.or.kr/race/card/decision/2026/${r}/${d}`;
        const res2 = await fetch(url2);
        const html2 = await res2.text();
        if (html2.indexOf("진익남") !== -1) {
          console.log(`진익남 found on ${r}/${d}!`);
        }
        await new Promise(r => setTimeout(r, 200));
      }
    }
  } else {
    console.log(`진익남 found at position ${jinIdx}`);
  }

  // 3. Look for the main entry table (Table 1 = comDataTable)
  // Split HTML by race sections and check each table
  const raceSections = html.split(/광명\s+\d+경주/);
  console.log(`\nRace sections found: ${raceSections.length - 1}`);

  // 4. For each race section, find Table 1 (선수정보) and check for 결 장
  const tableRegex = /<table[^>]*class="[^"]*comDataTable[^"]*"[^>]*>([\s\S]*?)<\/table>/g;
  let tableIdx = 0;
  let match;
  while ((match = tableRegex.exec(html)) !== null) {
    tableIdx++;
    const tableHtml = match[1];
    if (tableHtml.includes("결 장") || tableHtml.includes("결장")) {
      console.log(`\n=== TABLE ${tableIdx} contains 결장! ===`);
      // Show nearby header to identify table type
      const headerMatch = tableHtml.match(/<th[^>]*>([\s\S]{0,100})/);
      console.log(`  Header: ${headerMatch?.[1]?.replace(/\s+/g, " ").substring(0, 100)}`);

      // Find the row containing 결장
      const rows = tableHtml.split(/<tr/);
      for (const row of rows) {
        if (row.includes("결 장") || row.includes("결장")) {
          console.log(`\n  Row with 결장:\n  <tr${row.substring(0, 1500)}`);
        }
      }
    }
  }

  // 5. Also search without comDataTable class
  console.log("\n=== Searching ALL tables for 결장 in entry context ===");
  const allTables = [...html.matchAll(/<table[^>]*>([\s\S]*?)<\/table>/g)];
  console.log(`Total tables: ${allTables.length}`);
  for (let i = 0; i < allTables.length; i++) {
    const t = allTables[i][1];
    if ((t.includes("결 장") || t.includes("결장")) && t.includes("fnRacer.popup")) {
      console.log(`\n  TABLE ${i + 1}: has BOTH 결장 AND fnRacer.popup!`);
      // This could be the entry table with 결장
      const rows = t.split(/<tr/);
      for (const row of rows) {
        if (row.includes("결 장") || row.includes("결장")) {
          // Get the player name from this row or nearby
          const nameMatch = row.match(/fnRacer\.popup[^>]*>([^<]+)</);
          console.log(`  Player: ${nameMatch?.[1] || "unknown"}`);
          console.log(`  Row snippet: ${row.replace(/\s+/g, " ").substring(0, 500)}`);
        }
      }
    }
  }
}

main().catch(console.error);
