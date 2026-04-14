// Check multiple DC pages for 결장 patterns in the main entry table (not just recent performance)
async function main() {
  const pages = [
    [2026, 1, 1], [2026, 2, 1], [2026, 3, 1], [2026, 4, 1],
    [2026, 5, 1], [2026, 6, 1], [2026, 7, 1], [2026, 8, 1],
    [2026, 9, 1], [2026, 10, 1],
    [2025, 50, 1], [2025, 49, 1], [2025, 48, 1],
  ];

  for (const [year, round, day] of pages) {
    const url = `https://www.kcycle.or.kr/race/card/decision/${year}/${round}/${day}`;
    try {
      const res = await fetch(url);
      const html = await res.text();

      // Count 결 장 occurrences
      const count = (html.match(/결 장/g) || []).length;
      const count2 = (html.match(/결장/g) || []).length;

      // Check if 결 장 appears in the main entry table (comDataTable)
      // The main entry table has class="comDataTable"
      // Recent performance table is separate
      // Look for 결 장 near fnRacer.popup (main entry) vs near rating (recent perf)

      // Find all 결 장 contexts
      let inEntry = 0;
      let inRecent = 0;
      let idx = html.indexOf("결 장");
      while (idx !== -1) {
        const before = html.substring(Math.max(0, idx - 500), idx);
        if (before.includes("최근") || before.includes("rating")) {
          inRecent++;
        } else {
          inEntry++;
        }
        idx = html.indexOf("결 장", idx + 1);
      }

      console.log(`${year}/${round}/${day}: "결 장"=${count}, "결장"=${count2} (recent=${inRecent}, entry=${inEntry})`);
    } catch (e) {
      console.log(`${year}/${round}/${day}: ERROR ${(e as Error).message}`);
    }
    await new Promise(r => setTimeout(r, 300));
  }
}

main().catch(console.error);
