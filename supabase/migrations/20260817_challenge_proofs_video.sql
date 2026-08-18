-- Allow short video proofs in the private challenge-proofs bucket.
-- Safe to re-run.

update storage.buckets
set
  allowed_mime_types = array[
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
    'video/mp4',
    'video/quicktime',
    'video/webm'
  ],
  file_size_limit = 52428800
where id = 'challenge-proofs';
