-- Influencer categories (many-to-many), verified-engagement flag, and influencer
-- selections attached to contact submissions.
create table if not exists influencer_categories (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists influencer_categories_name_idx on influencer_categories (lower(name));

-- Deleting a category (or an influencer) removes only the link rows, never the other side.
create table if not exists influencer_category_links (
  influencer_id uuid not null references influencers(id) on delete cascade,
  category_id   uuid not null references influencer_categories(id) on delete cascade,
  primary key (influencer_id, category_id)
);
create index if not exists influencer_category_links_cat_idx on influencer_category_links(category_id);

alter table influencers add column if not exists engagement_verified boolean not null default false;
alter table influencers add column if not exists featured boolean not null default false;
-- [{ "id": "<uuid>", "name": "<display name at submit time>" }]
alter table contact_submissions add column if not exists influencers jsonb not null default '[]'::jsonb;
alter table contact_submissions add column if not exists kind text not null default 'project';
alter table contact_submissions add column if not exists campaign_dates text not null default '';
alter table contact_submissions add column if not exists notes text not null default '';

insert into influencer_categories (name, sort_order) values
  ('Lifestyle & Fashion', 1), ('Fitness & Dance', 2), ('Food & Travel', 3), ('Tech & Education', 4),
  ('Entertainment', 5), ('Business & Expert', 6), ('Other', 7)
on conflict do nothing;
