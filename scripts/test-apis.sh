#!/bin/bash
BASE="http://localhost:3099"
YEARS="2020 2023 2024 2025"

echo "=== API 엔드포인트 전체 테스트 ==="

echo ""
echo "--- 1. /api/data/race-results (연도 목록) ---"
curl -s "$BASE/api/data/race-results" | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'years: {d.get(\"years\",[])}'); print(f'count: {len(d.get(\"years\",[]))}')" 2>/dev/null || curl -s "$BASE/api/data/race-results"

for Y in $YEARS; do
  echo ""
  echo "--- 1a. /api/data/race-results?year=$Y (회차 목록) ---"
  RES=$(curl -s "$BASE/api/data/race-results?year=$Y")
  echo "$RES" | head -c 200
  echo ""
done

echo ""
echo "--- 1b. /api/data/race-results?year=2025&round=1&day=1 (상세) ---"
RES=$(curl -s "$BASE/api/data/race-results?year=2025&round=1&day=1")
RACE_COUNT=$(echo "$RES" | grep -o '"raceNo"' | wc -l)
echo "races count: $RACE_COUNT"
echo "$RES" | head -c 300
echo ""

echo ""
echo "--- 2. /api/data/decision-card (연도 목록) ---"
curl -s "$BASE/api/data/decision-card"

for Y in $YEARS; do
  echo ""
  echo "--- 2a. /api/data/decision-card?year=$Y (회차 목록) ---"
  RES=$(curl -s "$BASE/api/data/decision-card?year=$Y")
  echo "$RES" | head -c 300
  echo ""
done

echo ""
echo "--- 2b. /api/data/decision-card?year=2025&round=1&day=1 ---"
RES=$(curl -s "$BASE/api/data/decision-card?year=2025&round=1&day=1")
PAGE_COUNT=$(echo "$RES" | grep -o '"raceNo"' | wc -l)
echo "races in page: $PAGE_COUNT"
echo "$RES" | head -c 300
echo ""

echo ""
echo "--- 3. /api/data/racer-search (연도 목록) ---"
curl -s "$BASE/api/data/racer-search"

echo ""
echo "--- 3a. /api/data/racer-search?q=김 (전체 연도) ---"
RES=$(curl -s "$BASE/api/data/racer-search?q=%EA%B9%80")
COUNT=$(echo "$RES" | grep -o '"racerId"' | wc -l)
echo "results count: $COUNT"

echo ""
echo "--- 3b. /api/data/racer-search?q=김&year=2025 ---"
RES=$(curl -s "$BASE/api/data/racer-search?q=%EA%B9%80&year=2025")
COUNT=$(echo "$RES" | grep -o '"racerId"' | wc -l)
echo "2025 results count: $COUNT"
echo "$RES" | head -c 500
echo ""

echo ""
echo "--- 4. /api/data/race-dates ---"
for Y in $YEARS; do
  echo ""
  echo "--- 4a. /api/data/race-dates?year=$Y ---"
  RES=$(curl -s "$BASE/api/data/race-dates?year=$Y")
  DATE_COUNT=$(echo "$RES" | grep -o '"date"' | wc -l)
  echo "dates count: $DATE_COUNT"
done

echo ""
echo "--- 5. /api/data/statistics (타입 목록) ---"
curl -s "$BASE/api/data/statistics"

echo ""
echo "--- 5a. /api/data/statistics?type=dividend&year=2025 ---"
RES=$(curl -s "$BASE/api/data/statistics?type=dividend&year=2025")
echo "$RES" | head -c 300
echo ""

echo ""
echo "--- 5b. /api/data/statistics?type=no-hit ---"
RES=$(curl -s "$BASE/api/data/statistics?type=no-hit")
echo "$RES" | head -c 300
echo ""

echo ""
echo "=== 테스트 완료 ==="
