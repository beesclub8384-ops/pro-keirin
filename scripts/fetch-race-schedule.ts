// ============================================================
// 경주 일정 수집 스크립트 (Puppeteer)
// kcycle.or.kr/race/schedule 에서 연간 경주 일정을 스크래핑
// 사용법: npx tsx scripts/fetch-race-schedule.ts [year]
// ============================================================

import puppeteer from "puppeteer";
import * as fs from "fs";
import * as path from "path";

interface RaceScheduleEntry {
  date: string; // YYYY-MM-DD
  round: number; // 회차
  day: number; // 일차
}

const YEAR = parseInt(process.argv[2] || String(new Date().getFullYear()), 10);
const OUT_DIR = path.join(__dirname, "..", "src", "data");

async function fetchSchedule(year: number): Promise<RaceScheduleEntry[]> {
  console.log(`${year}년 경주 일정 수집 시작 (Puppeteer)...\n`);

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

    // 2) 해당 연도로 이동
    console.log(`${year}년으로 이동...`);
    await page.evaluate((y: number) => {
      (window as unknown as { fnSearch: (y: number) => void }).fnSearch(y);
    }, year);
    await new Promise((r) => setTimeout(r, 3000));

    // 3) 캘린더 HTML 디버깅: 구조 확인
    const calendarInfo = await page.evaluate(() => {
      const cal = document.querySelector(".calendar");
      if (!cal) return { found: false, html: "" };
      // 경주일 표시된 요소 찾기 - 다양한 선택자 시도
      const allLi = cal.querySelectorAll("li");
      const withA = cal.querySelectorAll("li a");
      const withClass = cal.querySelectorAll("li.on, li.mint, li.event, li.type01, li.type02, li.type03");
      const months = cal.querySelectorAll(".month, .calMonth, [class*=month]");

      // 첫 번째 month의 HTML 샘플
      let sampleHtml = "";
      if (months.length > 0) {
        sampleHtml = months[0].innerHTML.substring(0, 500);
      } else {
        sampleHtml = cal.innerHTML.substring(0, 500);
      }

      return {
        found: true,
        totalLi: allLi.length,
        withAnchor: withA.length,
        withClass: withClass.length,
        monthCount: months.length,
        sampleHtml,
      };
    });

    console.log("캘린더 구조:", JSON.stringify(calendarInfo, null, 2));

    // 4) 경주일에 해당하는 날짜 클릭하여 정보 추출
    //    kcycle 캘린더에서는 경주일에 <a> 태그가 붙고, 클릭하면 팝업에 정보가 표시됨
    const entries: RaceScheduleEntry[] = [];

    // 모든 월의 클릭 가능한 날짜 수집
    const clickableDates = await page.evaluate((yr: number) => {
      const results: { monthIdx: number; dayNum: number; classes: string }[] = [];
      const cal = document.querySelector(".calendar");
      if (!cal) return results;

      // .month 또는 월별 컨테이너 찾기
      const months = cal.querySelectorAll(".month, .calMonth");
      if (months.length > 0) {
        months.forEach((monthEl, mi) => {
          const anchors = monthEl.querySelectorAll("li a");
          anchors.forEach((a) => {
            const num = parseInt(a.textContent || "", 10);
            if (num > 0 && num <= 31) {
              const li = a.closest("li");
              results.push({ monthIdx: mi, dayNum: num, classes: li?.className || "" });
            }
          });
        });
      } else {
        // 대안: 전체 캘린더에서 a 태그 찾기
        const allAnchors = cal.querySelectorAll("a");
        allAnchors.forEach((a) => {
          const num = parseInt(a.textContent || "", 10);
          if (num > 0 && num <= 31) {
            const li = a.closest("li");
            results.push({ monthIdx: -1, dayNum: num, classes: li?.className || "" });
          }
        });
      }

      return results;
    }, year);

    console.log(`\n클릭 가능한 날짜: ${clickableDates.length}개`);

    if (clickableDates.length > 0) {
      console.log("샘플:", clickableDates.slice(0, 5));
    }

    // 각 날짜 클릭 → 팝업에서 회차/일차 추출
    for (const cd of clickableDates) {
      try {
        const clicked = await page.evaluate(
          (mi: number, dn: number) => {
            const cal = document.querySelector(".calendar");
            if (!cal) return false;
            const months = cal.querySelectorAll(".month, .calMonth");
            let container: Element | null = null;
            if (months.length > 0 && mi >= 0 && mi < months.length) {
              container = months[mi];
            } else {
              container = cal;
            }
            const anchors = container.querySelectorAll("li a");
            for (const a of anchors) {
              if (parseInt(a.textContent || "", 10) === dn) {
                (a as HTMLElement).click();
                return true;
              }
            }
            return false;
          },
          cd.monthIdx,
          cd.dayNum
        );

        if (!clicked) continue;
        await new Promise((r) => setTimeout(r, 600));

        // 팝업에서 정보 추출
        const info = await page.evaluate(() => {
          // 가능한 팝업 셀렉터들
          const selectors = [".calenPopup", ".schedulePopup", ".popup", "[class*=popup]"];
          let text = "";
          for (const sel of selectors) {
            const el = document.querySelector(sel);
            if (el && el.textContent && el.textContent.trim().length > 10) {
              text = el.textContent;
              break;
            }
          }
          if (!text) return null;

          // "2026년 03월 08일" 패턴
          const dateMatch = text.match(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/);
          // "제 N회차" 또는 "N회차" 또는 "N회"
          const roundMatch = text.match(/(?:제\s*)?(\d+)\s*회차?/);
          // "M일째" 또는 "M일차"
          const dayMatch = text.match(/(\d+)\s*일(?:째|차)/);

          if (dateMatch && roundMatch && dayMatch) {
            const mm = dateMatch[2].padStart(2, "0");
            const dd = dateMatch[3].padStart(2, "0");
            return {
              date: `${dateMatch[1]}-${mm}-${dd}`,
              round: parseInt(roundMatch[1], 10),
              day: parseInt(dayMatch[1], 10),
            };
          }
          return null;
        });

        if (info) {
          // 중복 체크
          const key = `${info.date}-${info.round}-${info.day}`;
          const exists = entries.some(
            (e) => `${e.date}-${e.round}-${e.day}` === key
          );
          if (!exists) {
            entries.push(info);
            console.log(`  ${info.date}: ${info.round}회차 ${info.day}일차`);
          }
        }

        // 팝업 닫기
        await page.evaluate(() => {
          const closeSelectors = [
            ".calenPopup .close",
            ".calenPopup .btn-close",
            ".calenPopup .btnClose",
            "[class*=popup] .close",
            "[class*=popup] button",
          ];
          for (const sel of closeSelectors) {
            const btn = document.querySelector(sel);
            if (btn) {
              (btn as HTMLElement).click();
              return;
            }
          }
          // class로 닫기
          const popup = document.querySelector(".calenPopup");
          if (popup) popup.classList.remove("open");
        });

        await new Promise((r) => setTimeout(r, 200));
      } catch {
        // skip
      }
    }

    return entries;
  } finally {
    await browser.close();
  }
}

// 대안: 출주표 API를 순차 probe하여 일정 수집
// 핵심: 응답 HTML에서 실제 회차/일차를 추출하여 요청한 것과 일치하는지 검증
async function fetchViaProbe(year: number): Promise<RaceScheduleEntry[]> {
  console.log(`출주표 probe 방식으로 ${year}년 일정 수집 시작...\n`);

  const entries: RaceScheduleEntry[] = [];
  let consecutiveEmpty = 0;

  for (let round = 1; round <= 60; round++) {
    if (consecutiveEmpty >= 3) {
      console.log(`\n${consecutiveEmpty}회 연속 빈 회차 - 탐색 종료`);
      break;
    }

    let foundAny = false;

    for (let day = 1; day <= 5; day++) {
      try {
        const url = `https://kcycle.or.kr/race/card/decision/popup/txt/${year}/${round}/${day}`;
        const res = await globalThis.fetch(url, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          },
        });

        if (!res.ok) {
          if (day === 1) break;
          break;
        }

        const html = await res.text();

        // HTML에서 실제 회차/일차 추출하여 검증
        // 패턴: "N회 M일차 확정본" 또는 "제N회차 M일째"
        const roundDayMatch = html.match(/(\d+)회\s*(\d+)일차/);
        if (!roundDayMatch) {
          if (day === 1) break;
          break;
        }

        const actualRound = parseInt(roundDayMatch[1], 10);
        const actualDay = parseInt(roundDayMatch[2], 10);

        // 요청한 회차/일차와 실제 응답이 다르면 → 해당 회차/일차는 존재하지 않음
        if (actualRound !== round || actualDay !== day) {
          if (day === 1) break;
          break;
        }

        // 날짜 추출
        const dateMatch = html.match(/(\d{4})년\s*(\d{2})월\s*(\d{2})일/);
        if (!dateMatch) {
          if (day === 1) break;
          break;
        }

        const date = `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;
        entries.push({ date, round, day });
        foundAny = true;
        console.log(`  ${date}: ${round}회차 ${day}일차`);

        await new Promise((r) => setTimeout(r, 300));
      } catch {
        if (day === 1) break;
        break;
      }
    }

    if (foundAny) {
      consecutiveEmpty = 0;
    } else {
      consecutiveEmpty++;
    }
  }

  return entries;
}

function saveResults(entries: RaceScheduleEntry[]) {
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
}

async function main() {
  // 1차: Puppeteer로 캘린더에서 수집 시도
  let entries = await fetchSchedule(YEAR);

  // 2차: 캘린더 수집 실패 시 출주표 probe
  if (entries.length === 0) {
    console.log("\nPuppeteer 수집 실패. 출주표 probe 방식으로 전환...\n");
    entries = await fetchViaProbe(YEAR);
  }

  if (entries.length === 0) {
    console.log("일정을 수집하지 못했습니다.");
    process.exit(1);
  }

  saveResults(entries);
}

main().catch(console.error);
