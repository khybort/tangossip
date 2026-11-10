-- All timestamps are epoch milliseconds.
CREATE TABLE account (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  pw TEXT NOT NULL,
  name TEXT NOT NULL,
  city TEXT,
  dance_since TEXT,
  instagram TEXT,
  references_text TEXT,
  email_verified INTEGER NOT NULL DEFAULT 0,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'moderator', 'admin')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'needs_info', 'approved', 'rejected', 'banned', 'deleted')),
  status_note TEXT,
  approved_by TEXT,
  approved_at INTEGER,
  trust_score INTEGER NOT NULL DEFAULT 0,
  totp_secret TEXT,
  totp_enabled INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  pw_changed_at INTEGER NOT NULL
);
CREATE INDEX account_status ON account(status);

CREATE TABLE session (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES account(id),
  mfa INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  ua TEXT
);
CREATE INDEX session_account ON session(account_id);

CREATE TABLE auth_token (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES account(id),
  purpose TEXT NOT NULL CHECK (purpose IN ('verify', 'reset')),
  expires_at INTEGER NOT NULL
);
CREATE INDEX auth_token_account ON auth_token(account_id, purpose);

CREATE TABLE throttle (k TEXT PRIMARY KEY, n INTEGER NOT NULL, window_start INTEGER NOT NULL);

CREATE TABLE setting (k TEXT PRIMARY KEY, v TEXT NOT NULL);
INSERT INTO setting (k, v) VALUES ('min_account_age_days', '3'), ('daily_report_limit', '3');

CREATE TABLE person (
  id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  city TEXT,
  roles TEXT NOT NULL DEFAULT '[]',
  instagram TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'hidden', 'merged', 'rejected')),
  merged_into TEXT REFERENCES person(id),
  claimed_by TEXT REFERENCES account(id),
  proposed_by TEXT REFERENCES account(id),
  created_at INTEGER NOT NULL
);
CREATE INDEX person_status ON person(status);
CREATE INDEX person_name ON person(normalized_name);

CREATE TABLE person_alias (
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL REFERENCES person(id),
  alias TEXT NOT NULL,
  normalized_alias TEXT NOT NULL
);
CREATE INDEX person_alias_person ON person_alias(person_id);
CREATE INDEX person_alias_name ON person_alias(normalized_alias);

CREATE TABLE category (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('active', 'proposed', 'rejected')),
  proposed_by TEXT REFERENCES account(id),
  sort INTEGER NOT NULL DEFAULT 100,
  created_at INTEGER NOT NULL
);

CREATE TABLE report (
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL REFERENCES person(id),
  author_id TEXT NOT NULL REFERENCES account(id),
  title TEXT NOT NULL,
  story TEXT NOT NULL,
  public_summary TEXT,
  incident_date TEXT,
  location TEXT,
  score INTEGER NOT NULL CHECK (score BETWEEN 1 AND 5),
  entry_recommendation TEXT NOT NULL CHECK (entry_recommendation IN ('deny', 'caution', 'allow')),
  firsthand TEXT NOT NULL CHECK (firsthand IN ('experienced', 'witnessed')),
  declaration_at INTEGER NOT NULL,
  content_flags TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'needs_info', 'approved', 'rejected', 'withdrawn', 'disputed', 'removed')),
  moderator_note TEXT,
  author_feedback TEXT,
  approved_by TEXT,
  approved_at INTEGER,
  version INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX report_person ON report(person_id, status);
CREATE INDEX report_author ON report(author_id);
CREATE INDEX report_status ON report(status);

CREATE TABLE report_category (
  report_id TEXT NOT NULL REFERENCES report(id),
  category_id TEXT NOT NULL REFERENCES category(id),
  PRIMARY KEY (report_id, category_id)
);

CREATE TABLE report_revision (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL REFERENCES report(id),
  version INTEGER NOT NULL,
  snapshot TEXT NOT NULL,
  edited_by TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE vote (
  report_id TEXT NOT NULL REFERENCES report(id),
  account_id TEXT NOT NULL REFERENCES account(id),
  kind TEXT NOT NULL CHECK (kind IN ('credible', 'corroborate')),
  value INTEGER NOT NULL CHECK (value IN (-1, 1)),
  ip_hash TEXT,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (report_id, account_id, kind)
);

CREATE TABLE reply (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL UNIQUE REFERENCES report(id),
  account_id TEXT NOT NULL REFERENCES account(id),
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  moderator_note TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE appeal (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL REFERENCES report(id),
  account_id TEXT NOT NULL REFERENCES account(id),
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'upheld', 'removed', 'edited')),
  resolution TEXT,
  resolved_by TEXT,
  created_at INTEGER NOT NULL,
  resolved_at INTEGER
);
CREATE INDEX appeal_status ON appeal(status);

CREATE TABLE claim_request (
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL REFERENCES person(id),
  account_id TEXT NOT NULL REFERENCES account(id),
  code TEXT NOT NULL,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'approved', 'rejected')),
  created_at INTEGER NOT NULL,
  resolved_at INTEGER
);
CREATE INDEX claim_status ON claim_request(status);

CREATE TABLE flag (
  id TEXT PRIMARY KEY,
  target_type TEXT NOT NULL CHECK (target_type IN ('report', 'reply', 'person')),
  target_id TEXT NOT NULL,
  account_id TEXT NOT NULL REFERENCES account(id),
  reason TEXT NOT NULL CHECK (reason IN ('false', 'personal_data', 'spam', 'other')),
  details TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  created_at INTEGER NOT NULL,
  UNIQUE (target_type, target_id, account_id)
);
CREATE INDEX flag_status ON flag(status);

CREATE TABLE takedown_request (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  url TEXT,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  resolution TEXT,
  ip_hash TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE audit_log (
  id TEXT PRIMARY KEY,
  actor_id TEXT,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  detail TEXT,
  ip_hash TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX audit_created ON audit_log(created_at);

INSERT INTO category (id, slug, name, description, status, sort, created_at) VALUES
  ('cat_cinsel_taciz', 'cinsel-taciz', 'Cinsel taciz', 'Cinsel içerikli söz, teklif, baskı veya davranış.', 'active', 10, 0),
  ('cat_istenmeyen_temas', 'istenmeyen-temas', 'İstenmeyen fiziksel temas', 'Dans sırasında veya dışında rıza dışı dokunma.', 'active', 20, 0),
  ('cat_sapkinlik', 'sapkinlik', 'Sapkınlık / rahatsız edici davranış', 'Teşhircilik, rahatsız edici mesajlar, uygunsuz görüntüler.', 'active', 30, 0),
  ('cat_israrli_takip', 'israrli-takip', 'Israrlı takip', 'Reddedilmesine rağmen sürdürülen takip, mesaj, yaklaşma.', 'active', 40, 0),
  ('cat_siddet', 'siddet-tehdit', 'Şiddet / tehdit', 'Fiziksel şiddet, tehdit veya korkutma.', 'active', 50, 0),
  ('cat_hirsizlik', 'hirsizlik', 'Hırsızlık', 'Eşya, para veya emeğin çalınması.', 'active', 60, 0),
  ('cat_dolandiricilik', 'dolandiricilik', 'Dolandırıcılık / para', 'Ödenmeyen borç, sahte organizasyon, para dolandırıcılığı.', 'active', 70, 0),
  ('cat_gorevi_kotuye', 'gorevi-kotuye-kullanma', 'Görevi / konumu kötüye kullanma', 'Öğretmen, organizatör veya DJ olarak gücün kötüye kullanılması.', 'active', 80, 0),
  ('cat_ayrimcilik', 'ayrimcilik', 'Ayrımcılık', 'Cinsiyet, yaş, köken, yönelim vb. temelli ayrımcılık.', 'active', 90, 0),
  ('cat_zorbalik', 'zorbalik', 'Zorbalık / aşağılama', 'Sistematik aşağılama, dışlama, psikolojik baskı.', 'active', 100, 0);
