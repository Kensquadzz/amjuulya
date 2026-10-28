-- Optional phone number on contact / influencer requests (stored for call-backs; not verified).
alter table contact_submissions add column if not exists phone text not null default '';
