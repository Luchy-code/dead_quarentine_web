ALTER TABLE usuario
  ADD COLUMN username_normalized VARCHAR(50)
    GENERATED ALWAYS AS (LOWER(TRIM(username))) STORED,
  ADD UNIQUE KEY uq_usuario_username_normalized (username_normalized);
