CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

INSERT INTO settings (key, value) VALUES ('gym_name', 'Empire Fitness');
INSERT INTO settings (key, value) VALUES ('gym_address', 'Hassan Trade Building, Last Floor, Near Kabal Tehsil');
INSERT INTO settings (key, value) VALUES ('currency', 'PKR');
