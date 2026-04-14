// 2026년 DC에서 racerId가 20250xxx인 선수 이름을 kcycle.or.kr DC 페이지에서 크롤링
import * as fs from "fs";
import * as path from "path";

const DC_JSON = path.join(__dirname, "..", "src", "data", "yearly-decision-card", "2026.json");

interface DCEntry { backNo: number; racerId: string; [key: string]: unknown; }
interface DCRace { raceNo: number; entries: DCEntry[]; [key: string]: unknown; }
interface DCPage { year: number; round: number; day: number; races: DCRace[]; [key: string]: unknown; }

async function main() {
  const data = JSON.parse(fs.readFileSync(DC_JSON, "utf-8"));
  const pages: DCPage[] = data.pages;

  // Find all 20250xxx racer IDs and which pages they appear in
  const targetIds = new Set<string>();
  const idPageMap = new Map<string, Set<string>>();

  for (const page of pages) {
    for (const race of page.races) {
      for (const entry of race.entries) {
        if (entry.racerId && entry.racerId.startsWith("2025")) {
          targetIds.add(entry.racerId);
          const key = `${page.round}|${page.day}`;
          if (!idPageMap.has(key)) idPageMap.set(key, new Set());
          idPageMap.get(key)!.add(entry.racerId);
        }
      }
    }
  }

  console.log(`Found ${targetIds.size} target racer IDs (20250xxx)\n`);

  const nameMap = new Map<string, string>();

  // Fetch DC pages and extract names using pattern: fnPlayerPop('RACER_ID')">NAME</a>
  for (const [key, ids] of idPageMap) {
    const [round, day] = key.split("|");
    // Skip if all IDs from this page already found
    const needed = [...ids].filter(id => !nameMap.has(id));
    if (needed.length === 0) continue;

    const url = `https://www.kcycle.or.kr/race/card/decision/2026/${round}/${day}`;
    console.log(`Fetching round ${round} day ${day} (${needed.length} IDs)...`);

    try {
      const res = await fetch(url);
      const html = await res.text();

      for (const id of needed) {
        // Pattern: fnPlayerPop('20250017')">최건묵</a>
        const pattern = new RegExp(`fnPlayerPop\\(['"]${id}['"]\\)[^>]*>([^<]+)<`, "g");
        const m = pattern.exec(html);
        if (m) {
          const name = m[1].trim();
          nameMap.set(id, name);
          console.log(`  ${id} → ${name}`);
        } else {
          // Broader fallback: look for the ID anywhere and grab nearby Korean text
          const altPattern = new RegExp(`${id}[^>]*>([가-힣]{2,4})<`, "g");
          const m2 = altPattern.exec(html);
          if (m2) {
            nameMap.set(id, m2[1]);
            console.log(`  ${id} → ${m2[1]} (alt)`);
          } else {
            console.log(`  ${id}: not found in this page`);
          }
        }
      }

      await new Promise((r) => setTimeout(r, 500));
    } catch (e) {
      console.error(`  Error: ${(e as Error).message}`);
    }
  }

  // Results
  console.log(`\n=== Results: ${nameMap.size}/${targetIds.size} ===`);
  for (const [id, name] of [...nameMap].sort()) {
    console.log(`  ${id}: ${name}`);
  }

  const missing = [...targetIds].filter(id => !nameMap.has(id));
  if (missing.length > 0) {
    console.log(`\nStill missing: ${missing.join(", ")}`);
  }

  // Save and update racer-ids 2025.json
  if (nameMap.size > 0) {
    // Load existing 2025 racer-ids and append new entries
    const racerIdsPath = path.join(__dirname, "..", "src", "data", "racer-ids", "2025.json");
    const existing: Array<{ racerId: string; name: string; rank: number }> =
      JSON.parse(fs.readFileSync(racerIdsPath, "utf-8"));

    const existingIds = new Set(existing.map(r => r.racerId));
    let added = 0;

    for (const [racerId, name] of nameMap) {
      if (!existingIds.has(racerId)) {
        existing.push({ racerId, name, rank: 0 });
        added++;
      }
    }

    if (added > 0) {
      fs.writeFileSync(racerIdsPath, JSON.stringify(existing, null, 2), "utf-8");
      console.log(`\nAppended ${added} new entries to ${racerIdsPath} (total: ${existing.length})`);
    }
  }
}

main().catch(console.error);
