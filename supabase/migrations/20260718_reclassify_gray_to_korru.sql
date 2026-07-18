-- 회색지대 14명 중 10명을 한국경륜노동조합(1노조, korru)으로 재분류
--   korru (파란 세모): 강동규 김규봉 김원호 김이남 김현 류근철 박제원 박종현 이정운 장인석
--   gray  (회색 세모) 유지: 김태율 성낙송 이태호 정충교
-- 기존 gray로 태깅된 행만 flip한다 (동명이인 pkru/NULL 행은 건드리지 않음).

UPDATE racer_profiles
  SET union_type = 'korru'
  WHERE union_type = 'gray'
    AND name IN (
      '강동규', '김규봉', '김원호', '김이남', '김현',
      '류근철', '박제원', '박종현', '이정운', '장인석'
    );

-- 보강: '김현'은 DB에 공백 포함 이름 "김  현"(racer_id 20130005)으로 저장되어 있어
--        위 name IN (...) 목록의 '김현'(공백 없음)과 매칭되지 않았다.
--        (김현 = 김  현, 공백 포함) → 공백 정규화로 전체 연도 행을 직접 korru 태깅.
--        pkru 행은 건드리지 않는다.
UPDATE racer_profiles
  SET union_type = 'korru'
  WHERE regexp_replace(name, '\s+', '', 'g') = '김현'
    AND union_type IS DISTINCT FROM 'pkru';
