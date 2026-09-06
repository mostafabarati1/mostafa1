-- Public readers only need published news and must not depend on an admin RPC.
-- The previous mixed policy evaluated is_admin() for anonymous requests and
-- failed when EXECUTE was intentionally unavailable to that role.
drop policy if exists "news public read published" on public.news;
create policy "news public read published" on public.news
  for select to anon, authenticated
  using (status = 'published');

-- Existing admin policies call this helper as authenticated users.
grant execute on function public.is_admin() to authenticated, service_role;
