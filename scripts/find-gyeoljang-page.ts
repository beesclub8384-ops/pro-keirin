// Search DC pages for 결장 in the main entry table (not just recent performance)
// Check day 2/3 pages where injuries from earlier days may cause withdrawals

async function main() {
  // Check 2026 all days, then 2025 recent rounds
  const pages: [number, number, number][] = [];

  // 2026: rounds 1-10, days 1-3
  for (let r = 1; r <= 10; r++) {
    for (let d = 1; d <= 3; d++) {
      pages.push([2026, r, d]);
    }
  }
  // 2025: rounds 50 down to 40, days 1-3
  for (let r = 50; r >= 40; r--) {
    for (let d = 1; d <= 3; d++) {
      pages.push([2025, r, d]);
    }
  }

  for (const [year, round, day] of pages) {
    const url = `https://www.kcycle.or.kr/race/card/decision/${year}/${round}/${day}`;
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const html = await res.text();
      if (html.length < 10000) continue; // empty page

      // Count total 결 장
      const allMatches = html.match(/결 장/g) || [];
      if (allMatches.length === 0) continue;

      // Find each occurrence and check if it's in main entry table or recent perf
      let idx = 0;
      const locations: string[] = [];
      let searchPos = 0;

      while ((idx = html.indexOf("결 장", searchPos)) !== -1) {
        // Get 1000 chars before for context
        const before = html.substring(Math.max(0, idx - 1000), idx);

        // Check what section we're in
        const isRecentSection = before.includes("최근") && before.lastIndexOf("최근") > before.lastIndexOf("comDataTable");
        const isInRatingSpan = html.substring(idx - 50, idx).includes('class="rating"');

        // Check if near fnRacer.popup (main entry table has player links)
        const lastPlayerLink = before.lastIndexOf("fnRacer.popup");
        const lastTableStart = before.lastIndexOf("<table");

        // Check for 선수정보 table markers
        const nearEntryTable = before.lastIndexOf("선수정보") > before.lastIndexOf("최근성적");

        locations.push(
          `  pos=${idx}, rating=${isRecentSection ? "recent" : "ENTRY?"}, ` +
          `lastPlayer=${lastPlayerLink > 0 ? idx - lastPlayerLink : -1}chars_ago`
        );

        searchPos = idx + 1;
      }

      console.log(`\n${url}`);
      console.log(`  총 ${allMatches.length}회 "결 장"`);
      for (const loc of locations) {
        console.log(loc);
      }

      // Show 800 chars context for first non-recent occurrence
      searchPos = 0;
      while ((idx = html.indexOf("결 장", searchPos)) !== -1) {
        const before800 = html.substring(Math.max(0, idx - 800), idx);
        const after200 = html.substring(idx, Math.min(html.length, idx + 200));

        // Is this possibly in the main entry table?
        const recentIdx = before800.lastIndexOf("최근");
        const tableIdx = before800.lastIndexOf("comDataTable");
        const entryIdx = before800.lastIndexOf("선수정보");

        if (entryIdx > recentIdx || tableIdx > recentIdx) {
          console.log(`\n  === POSSIBLE ENTRY TABLE OCCURRENCE at pos ${idx} ===`);
          console.log(before800.substring(before800.length - 400).replace(/\n/g, "\\n"));
          console.log("---결 장---");
          console.log(after200.replace(/\n/g, "\\n"));
        }

        searchPos = idx + 1;
      }
    } catch {
      // skip
    }
    await new Promise(r => setTimeout(r, 200));
  }
}

main().catch(console.error);
