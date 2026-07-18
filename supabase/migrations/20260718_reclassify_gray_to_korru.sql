-- 회색지대 14명 중 10명을 한국경륜노동조합(1노조, korru)으로 재분류
--   korru (파란 세모): 강동규 김규봉 김원호 김이남 김현 류근철 박제원 박종현 이정운 장인석
--   gray  (회색 세모) 유지: 김태율 성낙송 이태호 정충교
-- 기존 gray로 태깅된 행만 flip한다 (동명이인 pkru/NULL 행은 건드리지 않음).
-- 참고: 김현은 racer_profiles에 매칭 행이 없어 실제 갱신 대상은 9명.

UPDATE racer_profiles
  SET union_type = 'korru'
  WHERE union_type = 'gray'
    AND name IN (
      '강동규', '김규봉', '김원호', '김이남', '김현',
      '류근철', '박제원', '박종현', '이정운', '장인석'
    );
