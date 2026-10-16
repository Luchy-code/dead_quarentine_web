ALTER TABLE usuarios
  ADD COLUMN user_id VARCHAR(255) NULL AFTER id,
  ADD UNIQUE KEY uq_usuarios_user_id (user_id);

ALTER TABLE ranking
  ADD COLUMN user_id VARCHAR(255) NULL AFTER id,
  ADD INDEX idx_ranking_user_id (user_id);
