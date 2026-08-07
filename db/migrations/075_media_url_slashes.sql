-- Serve URLs used %2F for the slash in the S3 key, which proxies that
-- normalize escaped slashes redirect to a path the router can't match.
-- Rewrite stored URLs to use literal slashes.
UPDATE media SET url = replace(url, '%2F', '/') WHERE url LIKE '%\%2F%';
