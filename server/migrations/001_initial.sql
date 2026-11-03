CREATE TABLE users (
  id uuid PRIMARY KEY,
  username text NOT NULL UNIQUE CHECK (username = lower(username)),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 30),
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);
CREATE INDEX sessions_user ON sessions(user_id);
CREATE INDEX sessions_expiry ON sessions(expires_at);

CREATE TABLE lists (
  id uuid PRIMARY KEY,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 30),
  owner_id uuid NOT NULL REFERENCES users(id),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  invite_hash text UNIQUE,
  invite_expires timestamptz
);

CREATE TABLE members (
  list_id uuid NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id),
  PRIMARY KEY (list_id, user_id)
);
CREATE INDEX members_user ON members(user_id);

CREATE TABLE tasks (
  id uuid PRIMARY KEY,
  list_id uuid NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 100),
  note text NOT NULL DEFAULT '' CHECK (length(note) <= 2000),
  assignee uuid REFERENCES users(id),
  due timestamptz,
  done boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tasks_list ON tasks(list_id);

CREATE TABLE libraries (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES users(id),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 30),
  mode text NOT NULL CHECK (mode IN ('full', 'combine')),
  slots jsonb NOT NULL CHECK (jsonb_typeof(slots) = 'array'),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0)
);
CREATE INDEX libraries_owner ON libraries(owner_id);

CREATE TABLE name_records (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES users(id),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 300),
  mode text NOT NULL CHECK (mode IN ('full', 'combine')),
  source text NOT NULL CHECK (length(source) BETWEEN 1 AND 30),
  archive_date date NOT NULL,
  saved_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0)
);
CREATE INDEX records_owner_date ON name_records(owner_id, archive_date);

CREATE TABLE record_shares (
  record_id uuid NOT NULL REFERENCES name_records(id) ON DELETE CASCADE,
  list_id uuid NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  PRIMARY KEY (record_id, list_id)
);
CREATE INDEX shares_list ON record_shares(list_id);
