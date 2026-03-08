// ============================================================
// 경주 일정 수집 스크립트 (Puppeteer)
// kcycle.or.kr/race/schedule 캘린더에서 연간 경주 일정 스크래핑
// 사용법: npx tsx scripts/fetch-race-schedule.ts [year]
//
// 캘린더 DOM 구조:
//   .yearItem > .comCalendar > .dayGroup > .dayItem
//   경주일: <span class="mark mint" onclick="fnScheduleOpen(
//     this, "1", "2026\uB144 01\uC6D4 02\uC77C (\uAE08)",
//     "\uC81C01\uD68C\uCC28 01\uC77C\uC9F8", null)">2</span>
//   onclick 인자가 Unicode escape 형태로 저장됨
// ============================================================

import puppeteer from "puppeteer";
import * as fs from "fs";
import * as path from "path";

interface RaceScheduleEntry {
  date: string; // YYYY-MM-DD
  round: number; // 회차
  day: number; // 일차
  label: string; // 대회명 (있을 경우)
}

const YEAR = parseInt(process.argv[2] || String(new Date().getFullYear()), 10);
const OUT_DIR = path.join(__dirname, "..", "src", "data");

async function main() {
  console.log(`${YEAR}년 경주 일정 수집 시작 (Puppeteer)...\n`);

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
    );

    // 1) 일정 페이지 접속
    console.log("페이지 로딩...");
    await page.goto("https://kcycle.or.kr/race/schedule", {
      waitUntil: "networkidle2",
      timeout: 30000,
    });
    await new Promise((r) => setTimeout(r, 2000));

    // 2) 현재 표시 연도 확인, 필요시 해당 연도로 이동
    const displayedYear = await page.evaluate(() => {
      const el = document.querySelector(".yearTxt");
      if (!el) return 0;
      const m = (el.textContent || "").match(/(\d{4})/);
      return m ? parseInt(m[1], 10) : 0;
    });

    if (displayedYear !== YEAR) {
      console.log(`현재 ${displayedYear}년 → ${YEAR}년으로 이동...`);
      await page.evaluate((y: number) => {
        (window as unknown as { fnSearch: (y: number) => void }).fnSearch(y);
      }, YEAR);
      await new Promise((r) => setTimeout(r, 3000));
    }

    // 3) span.mark 요소의 onclick에서 fnScheduleOpen 인자 파싱
    //    onclick 값에 Unicode escape(\uXXXX)가 포함되어 있으므로
    //    숫자 패턴만으로 파싱
    const entries = await page.evaluate(() => {
      const results: {
        date: string;
        round: number;
        day: number;
        label: string;
      }[] = [];

      const marks = document.querySelectorAll("span.mark");

      for (const span of marks) {
        const onclick = span.getAttribute("onclick") || "";

        // fnScheduleOpen(this, "1", "2026\uB144 01\uC6D4 02\uC77C (...)", "\uC81C01\uD68C\uCC28 01\uC77C\uC9F8", null)
        // 숫자만 추출: 연도(4자리), 월(2자리), 일(2자리), 회차(1-2자리), 일째(1-2자리)
        // 인자 구분: 쉼표로 분리된 문자열들

        // 3번째 인자에서 날짜 추출: "2026... 01... 02..."
        // 4번째 인자에서 회차/일차 추출: "...01...01..."
        // 5번째 인자에서 대회명: "..." 또는 null

        // 간단한 접근: 전체 onclick에서 숫자 패턴 매칭
        // 날짜: 4자리 + 공백/유니코드 + 2자리 + 공백/유니코드 + 2자리
        const dateMatch = onclick.match(
          /(\d{4})\\u\w{4}\s*(\d{2})\\u\w{4}\s*(\d{2})\\u\w{4}/
        );

        // 회차/일차: 제XX회차 XX일째 → \uC81CXX\uD68C\uCC28 XX\uC77C\uC9F8
        // 패턴: \uC81C + 숫자 + \uD68C\uCC28 + 공백 + 숫자 + \uC77C\uC9F8
        const roundDayMatch = onclick.match(
          /\\uC81C(\d{1,2})\\uD68C\\uCC28\s*(\d{1,2})\\uC77C\\uC9F8/
        );

        if (dateMatch && roundDayMatch) {
          const dateStr = `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;
          const round = parseInt(roundDayMatch[1], 10);
          const day = parseInt(roundDayMatch[2], 10);

          // 5번째 인자 (대회명): null 또는 "문자열"
          let label = "";
          const labelMatch = onclick.match(
            /,\s*(?:"([^"]*)"|null)\s*\)$/
          );
          if (labelMatch && labelMatch[1]) {
            // Unicode decode
            label = labelMatch[1].replace(
              /\\u([0-9a-fA-F]{4})/g,
              (_, hex) => String.fromCharCode(parseInt(hex, 16))
            );
          }

          results.push({ date: dateStr, round, day, label });
        }
      }

      return results;
    });

    console.log(`${entries.length}개 경주일 수집 완료\n`);

    if (entries.length === 0) {
      console.log("경주 일정을 수집하지 못했습니다.");
      await browser.close();
      process.exit(1);
    }

    // 월별 요약 출력
    const byMonth = new Map<string, typeof entries>();
    for (const e of entries) {
      const mm = e.date.substring(0, 7);
      if (!byMonth.has(mm)) byMonth.set(mm, []);
      byMonth.get(mm)!.push(e);
    }

    for (const [month, days] of byMonth) {
      const rounds = [...new Set(days.map((d) => d.round))];
      console.log(
        `  ${month}: ${days.length}일 (${rounds.map((r) => r + "회차").join(", ")})`
      );
      for (const d of days) {
        const label = d.label ? ` [${d.label}]` : "";
        console.log(`    ${d.date}: ${d.round}회차 ${d.day}일차${label}`);
      }
    }

    // 저장
    entries.sort((a, b) => a.date.localeCompare(b.date));
    const output = {
      year: YEAR,
      totalDays: entries.length,
      schedule: entries,
    };

    const outPath = path.join(OUT_DIR, `race-schedule-${YEAR}.json`);
    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(output, null, 2), "utf-8");

    console.log(`\n=== 수집 완료 ===`);
    console.log(`총 ${entries.length}일 저장: ${outPath}`);
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
