-- 在 Supabase SQL Editor 中执行此脚本，为 families 表添加邀请码功能
-- Run this in Supabase Dashboard → SQL Editor

ALTER TABLE families
ADD COLUMN IF NOT EXISTS invite_code TEXT UNIQUE;

-- 邀请码由应用在首次「邀请家人」时自动生成，无需在此预填
