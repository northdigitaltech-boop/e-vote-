-- Halqa 4 Roundu Pre-Polling System 2026 — DB import (phpMyAdmin / Railway ready)
-- Import INTO an already-created database (no CREATE DATABASE / USE here).

CREATE TABLE IF NOT EXISTS candidates (
  id INT PRIMARY KEY AUTO_INCREMENT, name VARCHAR(255) NOT NULL,
  party_name VARCHAR(100) NOT NULL, symbol VARCHAR(100), photo VARCHAR(500),
  description TEXT, active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS unions (
  id INT PRIMARY KEY AUTO_INCREMENT, union_name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS voters (
  id INT PRIMARY KEY AUTO_INCREMENT, name VARCHAR(255) NOT NULL,
  mobile VARCHAR(20) NOT NULL UNIQUE, email VARCHAR(255), village VARCHAR(255),
  union_id INT, ip_address VARCHAR(50),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (union_id) REFERENCES unions(id)
);
CREATE TABLE IF NOT EXISTS votes (
  id INT PRIMARY KEY AUTO_INCREMENT, voter_id INT NOT NULL, candidate_id INT NOT NULL,
  union_id INT NOT NULL, vote_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (voter_id) REFERENCES voters(id),
  FOREIGN KEY (candidate_id) REFERENCES candidates(id),
  FOREIGN KEY (union_id) REFERENCES unions(id)
);
CREATE TABLE IF NOT EXISTS otps (
  id INT PRIMARY KEY AUTO_INCREMENT, mobile VARCHAR(20) NOT NULL,
  otp_code VARCHAR(6) NOT NULL, expires_at TIMESTAMP NOT NULL,
  used TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, INDEX idx_mobile (mobile)
);
CREATE TABLE IF NOT EXISTS admin_users (
  id INT PRIMARY KEY AUTO_INCREMENT, username VARCHAR(50) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS activity_logs (
  id INT PRIMARY KEY AUTO_INCREMENT, action VARCHAR(100) NOT NULL, details TEXT,
  ip_address VARCHAR(50), created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO unions (union_name) VALUES
  ('Union Council Roundu'), ('Union Council Ghasing'), ('Union Council Kalam'),
  ('Union Council Bahrain'), ('Union Council Madyan');

INSERT INTO candidates (name, party_name, symbol, description) VALUES
  ('Raja Nasir Ali Khan','PPP','Arrow','PPP candidate for GBA-10 Skardu-IV (Roundu).'),
  ('Wazir Hassan','PML-N','Tiger','PML-N candidate for GBA-10 Skardu-IV (Roundu).'),
  ('Muhammad Khan','IPP','Eagle','IPP candidate for GBA-10 Skardu-IV (Roundu).'),
  ('Muhammad Sharif (Dr. Sharif)','PTI','Cricket Bat','PTI candidate for GBA-10 Skardu-IV (Roundu).'),
  ('Mushtaq Hakimi','MWM','Tent','MWM candidate for GBA-10 Skardu-IV (Roundu).'),
  ('Muhammad Kabir','PNP','Railway Engine','PNP candidate for GBA-10 Skardu-IV (Roundu).'),
  ('Shaban Ali','Independent','Star','Independent candidate for GBA-10 Skardu-IV (Roundu).'),
  ('Safdar Ali','Independent','Pine Apple','Independent candidate for GBA-10 Skardu-IV (Roundu).'),
  ('Alam Noor','Independent','Topi Shanti','Independent candidate for GBA-10 Skardu-IV (Roundu).'),
  ('Nazim Hussain','AWP','Bulb','AWP candidate for GBA-10 Skardu-IV (Roundu).'),
  ('Wazir Muhammad Kazim','Independent','Key with Lock','Independent candidate for GBA-10 Skardu-IV (Roundu).'),
  ('Wazir Ejaz','Independent','Two Swords','Independent candidate for GBA-10 Skardu-IV (Roundu).');
