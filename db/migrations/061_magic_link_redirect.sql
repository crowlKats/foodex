-- A magic link is often the second half of a journey that started somewhere
-- else, most visibly a household invite link, which sends a signed-out
-- invitee through sign-in first.
--
-- The destination has to live on the token rather than in the link's query
-- string: the link is frequently opened in a different browser (mail app,
-- phone) from the one that requested it, so a cookie wouldn't survive, and
-- anything in the URL would be user-editable on the way back in.
ALTER TABLE magic_link_tokens
  ADD COLUMN redirect_to TEXT;

COMMENT ON COLUMN magic_link_tokens.redirect_to IS
  'Same-origin path to land on after sign-in; NULL means the default landing page.';
