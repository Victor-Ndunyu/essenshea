-- Fix literal \n in review texts from earlier buggy seed
-- Replace literal backslash-n with actual newline characters
UPDATE site_reviews
SET text = REPLACE(text, E'\\n', E'\n')
WHERE text LIKE E'%\\n%';

-- Remove duplicate reviews that appeared after fix (keep earliest entry)
DELETE FROM site_reviews a
USING site_reviews b
WHERE a.id > b.id
  AND a.author = b.author
  AND a.role = b.role
  AND a.text = b.text;
