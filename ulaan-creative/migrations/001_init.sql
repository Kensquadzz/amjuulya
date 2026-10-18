-- Ulaan Creative CMS — initial schema
create extension if not exists pgcrypto;

create table if not exists admin_users (
  id            uuid primary key default gen_random_uuid(),
  email         text not null unique,
  password_hash text not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  last_login_at timestamptz
);

create table if not exists admin_sessions (
  id           text primary key,                 -- sha256 of the cookie token (raw token never stored)
  user_id      uuid not null references admin_users(id) on delete cascade,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at   timestamptz not null,
  ip_hash      text,
  user_agent   text
);
create index if not exists admin_sessions_user_idx on admin_sessions(user_id);
create index if not exists admin_sessions_expires_idx on admin_sessions(expires_at);

-- Generic sliding-window rate limit buckets (login, contact form)
create table if not exists rate_events (
  bucket     text not null,
  key        text not null,
  created_at timestamptz not null default now()
);
create index if not exists rate_events_lookup_idx on rate_events(bucket, key, created_at);

create table if not exists media (
  id            uuid primary key default gen_random_uuid(),
  kind          text not null check (kind in ('image', 'video')),
  status        text not null default 'pending' check (status in ('pending', 'ready', 'failed')),
  storage_key   text not null unique,
  thumb_key     text,
  original_name text not null,
  mime          text not null,
  size_bytes    bigint not null,
  width         int,
  height        int,
  duration_s    numeric(10, 2),
  sha256        text,
  alt_text      text not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists media_kind_idx on media(kind, created_at desc);
create index if not exists media_sha_idx on media(sha256) where sha256 is not null;

create table if not exists projects (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique,
  title           text not null,
  description     text not null default '',
  category        text not null default '',
  client_name     text not null default '',
  project_date    date,
  cover_media_id  uuid references media(id) on delete set null,
  video_media_id  uuid references media(id) on delete set null,
  video_url       text not null default '',
  external_url    text not null default '',
  sort_order      int not null default 0,
  status          text not null default 'draft' check (status in ('draft', 'published')),
  seo_title       text not null default '',
  seo_description text not null default '',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  published_at    timestamptz
);
create index if not exists projects_public_idx on projects(status, sort_order);

create table if not exists project_media (
  project_id uuid not null references projects(id) on delete cascade,
  media_id   uuid not null references media(id) on delete restrict,
  sort_order int not null default 0,
  primary key (project_id, media_id)
);
create index if not exists project_media_media_idx on project_media(media_id);

create table if not exists influencers (
  id               uuid primary key default gen_random_uuid(),
  display_name     text not null,
  profile_media_id uuid references media(id) on delete set null,
  instagram_url    text not null default '',
  tiktok_url       text not null default '',
  youtube_url      text not null default '',
  follower_count   bigint,
  category         text not null default '',
  bio              text not null default '',
  engagement       text not null default '',
  sort_order       int not null default 0,
  status           text not null default 'draft' check (status in ('draft', 'published')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  published_at     timestamptz
);
create index if not exists influencers_public_idx on influencers(status, sort_order);

-- Editable website content. Each key holds one section as JSON, with separate
-- draft and published versions so edits can be reviewed before going live.
create table if not exists site_content (
  key          text primary key,
  draft        jsonb,
  published    jsonb,
  updated_at   timestamptz not null default now(),
  published_at timestamptz
);

create table if not exists contact_submissions (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  company     text not null default '',
  contact     text not null,
  service     text not null,
  budget      text not null default '',
  message     text not null,
  consent     boolean not null default false,
  status      text not null default 'new' check (status in ('new', 'read', 'archived')),
  email_sent  boolean not null default false,
  ip_hash     text,
  user_agent  text,
  created_at  timestamptz not null default now()
);
create index if not exists contact_submissions_created_idx on contact_submissions(created_at desc);
