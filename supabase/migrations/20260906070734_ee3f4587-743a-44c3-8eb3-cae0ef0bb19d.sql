CREATE POLICY "Users can upload their own track covers"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'track-covers' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can update their own track covers"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'track-covers' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can delete their own track covers"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'track-covers' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Anyone can view track covers"
ON storage.objects FOR SELECT TO anon, authenticated
USING (bucket_id = 'track-covers');