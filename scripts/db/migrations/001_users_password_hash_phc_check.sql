DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.users'::regclass
       AND conname = 'users_password_hash_phc_check'
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_password_hash_phc_check
      CHECK (password_hash ~ $hash$^\$argon2id\$v=19\$m=19456,t=2,p=1\$[A-Za-z0-9+/]{22}\$[A-Za-z0-9+/]{43}$hash$) NOT VALID;
    ALTER TABLE public.users VALIDATE CONSTRAINT users_password_hash_phc_check;
  END IF;
END $$;
