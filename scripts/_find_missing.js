// 원래 건수 (첫 수집 결과)
const original = {
  2003:1616, 2004:1708, 2005:1680, 2006:1878, 2007:2136, 2008:2036,
  2009:2058, 2010:2086, 2011:2058, 2012:2100, 2013:2100, 2014:2125,
  2015:2156, 2016:2158, 2017:2184, 2018:2292, 2019:2414, 2020:402,
  2021:798, 2022:2403, 2023:2400, 2024:2496, 2025:2480, 2026:496,
};

const fs = require('fs');
const path = require('path');
const DATA_DIR = path.join(__dirname, '..', 'src', 'data', 'yearly-race-sales');

const needRefetch = [];
for (const [year, origCount] of Object.entries(original)) {
  const file = path.join(DATA_DIR, `${year}.json`);
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const diff = data.length - origCount;
  if (diff !== 0) {
    console.log(`${year}: 원래 ${origCount}건 → 현재 ${data.length}건 (${diff}건)`);
    needRefetch.push(year);
  }
}
if (needRefetch.length === 0) {
  console.log('모든 연도 원래 건수와 일치');
} else {
  console.log(`\n재수집 필요: ${needRefetch.join(', ')}`);
}
