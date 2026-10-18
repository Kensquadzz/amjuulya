-- Influencer price (admin only, never sent to the public site) and Facebook link.
alter table influencers add column if not exists price text not null default '';
alter table influencers add column if not exists facebook_url text not null default '';
