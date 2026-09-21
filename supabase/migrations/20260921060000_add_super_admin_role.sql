-- Phase A: add the new technical Super Admin role.
-- Kept in its own migration so the enum value is committed before later
-- migrations reference it in function bodies, constraints, or data changes.

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'super_admin';
