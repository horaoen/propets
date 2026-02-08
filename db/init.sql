CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  phone VARCHAR(20) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('admin', 'member') NOT NULL DEFAULT 'member',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_users_phone (phone)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS ledger_entries (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  entry_type ENUM('donation', 'expense') NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  occurred_at DATETIME NOT NULL,
  description VARCHAR(500) NOT NULL DEFAULT '',
  month_key CHAR(7) GENERATED ALWAYS AS (
    DATE_FORMAT(occurred_at + INTERVAL 8 HOUR, '%Y-%m')
  ) STORED,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  deleted_by BIGINT UNSIGNED NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_ledger_user_created (user_id, created_at DESC, id DESC),
  KEY idx_ledger_month_created (month_key, created_at DESC, id DESC),
  KEY idx_ledger_type_month (entry_type, month_key, created_at DESC, id DESC),
  KEY idx_ledger_created (created_at DESC, id DESC),
  KEY idx_ledger_deleted (deleted_at),
  CONSTRAINT chk_ledger_amount_positive CHECK (amount > 0),
  CONSTRAINT fk_ledger_entries_user_id
    FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_ledger_entries_deleted_by
    FOREIGN KEY (deleted_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS reversal_links (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  original_entry_id BIGINT UNSIGNED NOT NULL,
  reversal_entry_id BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_reversal_links_reversal_entry (reversal_entry_id),
  UNIQUE KEY uk_reversal_links_original_reversal (original_entry_id, reversal_entry_id),
  KEY idx_reversal_links_original_created (original_entry_id, created_at DESC),
  CONSTRAINT chk_reversal_links_not_self CHECK (original_entry_id <> reversal_entry_id),
  CONSTRAINT fk_reversal_links_original_entry
    FOREIGN KEY (original_entry_id) REFERENCES ledger_entries(id),
  CONSTRAINT fk_reversal_links_reversal_entry
    FOREIGN KEY (reversal_entry_id) REFERENCES ledger_entries(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  token_hash CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  revoked_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_refresh_token_hash (token_hash),
  KEY idx_refresh_user_id (user_id),
  KEY idx_refresh_expires_at (expires_at),
  CONSTRAINT fk_refresh_tokens_user_id
    FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS ledger_idempotency_keys (
  request_id VARCHAR(128) NOT NULL,
  operation ENUM('donation', 'expense', 'reversal') NOT NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  entry_id BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (request_id),
  KEY idx_ledger_idempotency_created_by (created_by, created_at DESC),
  CONSTRAINT fk_ledger_idempotency_user_id
    FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT fk_ledger_idempotency_entry_id
    FOREIGN KEY (entry_id) REFERENCES ledger_entries(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
