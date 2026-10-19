-- Influencer tab hero collage: which creators appear, in what order, how big, and which part of
-- the photo stays in frame. Follower tiers (NANO…MEGA) are computed from follower_count, not stored.
alter table influencers add column if not exists in_collage boolean not null default false;
alter table influencers add column if not exists collage_order integer not null default 0;
alter table influencers add column if not exists collage_size text not null default 'm';
alter table influencers add column if not exists collage_focus text not null default 'top';
do $$ begin
  alter table influencers add constraint influencers_collage_size_chk check (collage_size in ('s', 'm', 'l', 'xl'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table influencers add constraint influencers_collage_focus_chk check (collage_focus in ('top', 'center', 'bottom'));
exception when duplicate_object then null; end $$;
create index if not exists influencers_collage_idx on influencers (collage_order) where in_collage;
