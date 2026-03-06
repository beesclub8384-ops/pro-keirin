-- Add is_absent column to decision_card_entries
-- Tracks whether a racer was withdrawn (결장) for this race
ALTER TABLE decision_card_entries
  ADD COLUMN IF NOT EXISTS is_absent BOOLEAN NOT NULL DEFAULT false;
