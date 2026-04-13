-- 1. 질문 풀 테이블
CREATE TABLE interview_questions (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,           -- 'A1-1', 'B2-3', 'C4-6' 등
  category TEXT NOT NULL,              -- 'A', 'B', 'C', 'D', 'E'
  subcategory TEXT NOT NULL,           -- 'A-1', 'A-2', 'B-1', 'C-4' 등
  question_text TEXT NOT NULL,         -- 질문 본문
  format TEXT NOT NULL DEFAULT 'text', -- 'text'(주관식), 'scale'(5점척도), 'choice_text'(선택+주관식)
  choices JSONB,                       -- 선택지 (scale이나 choice_text일 때만 사용)
  condition JSONB,                     -- 출제 조건 (예: {"trigger": "win_streak", "min": 3})
  requires_race_specific BOOLEAN DEFAULT FALSE, -- 경주 특정이 필요한 질문인지
  requires_auto_generate BOOLEAN DEFAULT FALSE, -- AI/DB가 자동 생성하는 질문인지
  requires_player_explain BOOLEAN DEFAULT FALSE, -- 선수가 구체적 설명해야 하는 질문인지
  note TEXT,                           -- 비고
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. 인터뷰 요청 테이블
CREATE TABLE interview_requests (
  id SERIAL PRIMARY KEY,
  racer_id INTEGER,                    -- 선수 ID (racer_profiles 참조)
  player_name TEXT NOT NULL,           -- 선수 이름
  grade TEXT,                          -- 등급 (선발/우수/특선)
  region TEXT,                         -- 지부
  request_type TEXT NOT NULL DEFAULT 'regular', -- 'regular', 'event', 'rookie', 'special'
  selected_questions JSONB NOT NULL,   -- 선택된 질문 코드 배열 (예: ["A1-1","A2-1","A5-3","B2-5","C1-1"])
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending'(대기), 'sent'(발송됨), 'in_progress'(작성중), 'completed'(완료), 'expired'(만료)
  form_url TEXT,                       -- 선수에게 보낼 폼 URL
  sent_at TIMESTAMPTZ,                 -- 알림 발송 시각
  completed_at TIMESTAMPTZ,            -- 선수 답변 완료 시각
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. 선수 답변 테이블
CREATE TABLE interview_responses (
  id SERIAL PRIMARY KEY,
  request_id INTEGER NOT NULL REFERENCES interview_requests(id),
  question_code TEXT NOT NULL,          -- 질문 코드 (A1-1 등)
  question_text TEXT NOT NULL,          -- 실제 보여준 질문 (자동생성된 경우 원본과 다를 수 있음)
  answer_text TEXT,                     -- 주관식 답변
  answer_choice TEXT,                   -- 선택형 답변 (scale 점수 또는 선택지)
  photo_urls JSONB,                     -- 사진 URL 배열
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. 기사 테이블
CREATE TABLE interview_articles (
  id SERIAL PRIMARY KEY,
  request_id INTEGER NOT NULL REFERENCES interview_requests(id),
  player_name TEXT NOT NULL,
  grade TEXT,
  region TEXT,
  article_raw TEXT,                     -- AI가 생성한 원본 기사
  article_edited TEXT,                  -- 태양이 수정한 기사 (없으면 원본 사용)
  headline TEXT,                        -- 헤드라인
  photos JSONB,                         -- 사진 URL 배열
  analysis_note TEXT,                   -- 📊 분석 노트
  status TEXT NOT NULL DEFAULT 'draft', -- 'draft'(초안), 'review'(검토중), 'approved'(승인), 'rejected'(반려), 'published'(공개)
  reject_reason TEXT,                   -- 반려 사유
  published_at TIMESTAMPTZ,            -- 공개 시각
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스
CREATE INDEX idx_interview_questions_category ON interview_questions(category);
CREATE INDEX idx_interview_requests_status ON interview_requests(status);
CREATE INDEX idx_interview_requests_racer ON interview_requests(racer_id);
CREATE INDEX idx_interview_articles_status ON interview_articles(status);
CREATE INDEX idx_interview_articles_published ON interview_articles(published_at);
