# Castles Server Deployment Runbook

This runbook deploys one private-beta Node process behind nginx for `https://castles.ls314.com`.

Do not deploy from a dirty worktree, a moving branch name, or an unreviewed commit. Use an exact commit SHA.

Before copying commands to another host, replace these site-specific values everywhere they appear:

```text
linux user:        lukasz
repo path:         /home/lukasz/Castles
domain:            castles.ls314.com
node port:         3000
systemd env file:  /etc/castles/castles.env
database name:     castles
database user:     castles
```

The server must already have Node, npm, git, nginx, certbot, PostgreSQL, `psql`, and `pg_dump`.

## 1. Preflight

On the server, set the reviewed commit SHA first:

```bash
sha="<reviewed-commit-sha>"
cd /home/lukasz/Castles
hostname
node --version
npm --version
git --version
git status --short --branch
git rev-parse HEAD
sudo systemctl status castles-node.service --no-pager
sudo nginx -T | sed -n '/server_name castles.ls314.com/,+80p'
```

Hard stop if the checkout is dirty:

```bash
test -z "$(git status --porcelain)" || {
  echo "Dirty worktree. Back up and classify changes before deploying."
  git status --short
  exit 1
}
```

If only `package-lock.json` is dirty, save the diff in the backup folder, decide whether it came from an intentional dependency update, and do not deploy until it is either committed through normal source control or discarded with explicit approval.

## 2. Backup

Create a timestamped backup before changing code, config, or data:

```bash
umask 077
ts="$(date -u +%Y%m%d-%H%M%S)"
backup="/home/lukasz/deploy-backups/castles-${ts}"
mkdir -p -m 700 "$backup"

cd /home/lukasz/Castles
git status --short --branch > "$backup/git-status.txt"
git rev-parse HEAD > "$backup/old-sha.txt"
git diff -- package-lock.json > "$backup/package-lock.diff"

if [ -f /etc/nginx/sites-available/castles ]; then
  sudo cp -a /etc/nginx/sites-available/castles "$backup/nginx-castles.conf"
fi
readlink -f /etc/nginx/sites-enabled/castles > "$backup/nginx-enabled-target.txt" 2>/dev/null || true
if [ -f /etc/systemd/system/castles-node.service ]; then
  sudo cp -a /etc/systemd/system/castles-node.service "$backup/castles-node.service"
fi
sudo cp -a /etc/castles/castles.env "$backup/castles.env" 2>/dev/null || true

db_url="$(sudo awk -F= '$1=="DATABASE_URL"{print substr($0, index($0, "=") + 1)}' /etc/castles/castles.env 2>/dev/null || true)"
if [ -n "$db_url" ]; then
  eval "$(
    DATABASE_URL="$db_url" node - <<'NODE'
const url = new URL(process.env.DATABASE_URL);
const quote = (value) => `'${String(value).replace(/'/g, `'\\''`)}'`;
const env = {
  PGHOST: url.hostname,
  PGPORT: url.port || "5432",
  PGDATABASE: url.pathname.replace(/^\//, ""),
  PGUSER: decodeURIComponent(url.username),
  PGPASSWORD: decodeURIComponent(url.password),
};
for (const [key, value] of Object.entries(env)) {
  console.log(`export ${key}=${quote(value)}`);
}
NODE
  )"
  command -v pg_dump >/dev/null || {
    echo "pg_dump is required to back up PostgreSQL online events."
    exit 1
  }
  pg_dump > "$backup/postgres-online-events.sql"
  test -s "$backup/postgres-online-events.sql" || {
    echo "PostgreSQL backup is empty or failed."
    exit 1
  }
fi

sudo sh -c 'find "$1" -type f ! -name SHA256SUMS.txt -exec sha256sum {} + > "$1/SHA256SUMS.txt"' sh "$backup"
```

## 3. Deploy Exact Commit

```bash
cd /home/lukasz/Castles
test -z "$(git status --porcelain)" || {
  echo "Dirty worktree. Stop before changing the live checkout."
  git status --short
  exit 1
}

git fetch origin
git checkout "$sha"
test "$(git rev-parse HEAD)" = "$sha" || {
  echo "Checked out commit does not match requested SHA."
  exit 1
}
git status --short --branch
test -z "$(git status --porcelain)" || {
  echo "Checkout is dirty after selecting SHA."
  git status --short
  exit 1
}
npm ci
npm run build
npm run server:build
```

Set up the runtime environment:

```bash
test -n "${backup:-}" && test -d "$backup" || {
  echo "The backup variable is not set to a real backup directory. Run step 2 first."
  exit 1
}
sudo install -d -m 755 /etc/castles
if [ ! -f /etc/castles/castles.env ]; then
  sudo install -m 600 deploy/systemd/castles.env.example /etc/castles/castles.env
fi
sudo cp -a /etc/castles/castles.env "$backup/castles.env.predeploy"
sudo grep -qx "NODE_ENV=production" /etc/castles/castles.env || sudo sh -c 'printf "\nNODE_ENV=production\n" >> /etc/castles/castles.env'
sudo grep -qx "CASTLES_REQUIRE_STATIC_DIR=1" /etc/castles/castles.env || sudo sh -c 'printf "\nCASTLES_REQUIRE_STATIC_DIR=1\n" >> /etc/castles/castles.env'
sudo sed -i "s/GIT_COMMIT=.*/GIT_COMMIT=$sha/" /etc/castles/castles.env
sudo sed -i "s/BUILD_ID=.*/BUILD_ID=$(date -u +%Y%m%d-%H%M%S)/" /etc/castles/castles.env
sudo chmod 600 /etc/castles/castles.env
sudo grep -qx "ONLINE_STORE_BACKEND=postgres" /etc/castles/castles.env || {
  echo "ONLINE_STORE_BACKEND must be postgres before deployment."
  exit 1
}
sudo grep -q "^DATABASE_URL=postgresql://" /etc/castles/castles.env || {
  echo "DATABASE_URL must be set before deployment."
  exit 1
}
```

Review `/etc/castles/castles.env` before starting. It should contain:

```text
NODE_ENV=production
PORT=3000
PUBLIC_BASE_URL=https://castles.ls314.com
ONLINE_STORE_BACKEND=postgres
DATABASE_URL=postgresql://castles:<password>@localhost:5432/castles
CASTLES_STATIC_DIR=/home/lukasz/Castles/build
CASTLES_REQUIRE_STATIC_DIR=1
BUILD_ID=<timestamp>
GIT_COMMIT=<reviewed-commit-sha>
```

Create or update the database and app user before starting the service. Replace the password with the same value used in `DATABASE_URL`.

Use a URL-encoded password in `DATABASE_URL`. For example, a literal password `p@$&;#` becomes `p%40%24%26%3B%23` inside the URL. In the SQL block below, escape a single quote in the literal password by writing it twice.

```bash
sudo -u postgres psql <<'SQL'
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'castles') THEN
    CREATE ROLE castles LOGIN PASSWORD 'replace-with-password';
  ELSE
    ALTER ROLE castles WITH PASSWORD 'replace-with-password';
  END IF;
END;
$$;
SELECT 'CREATE DATABASE castles OWNER castles'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'castles')\gexec
GRANT CONNECT ON DATABASE castles TO castles;
\c castles
GRANT USAGE, CREATE ON SCHEMA public TO castles;
SQL
```

Then verify the app user can connect and create tables:

```bash
load_castles_db_env() {
  local db_url
  db_url="$(sudo awk -F= '$1=="DATABASE_URL"{print substr($0, index($0, "=") + 1)}' /etc/castles/castles.env)"
  eval "$(
    DATABASE_URL="$db_url" node - <<'NODE'
const url = new URL(process.env.DATABASE_URL);
const quote = (value) => `'${String(value).replace(/'/g, `'\\''`)}'`;
const env = {
  PGHOST: url.hostname,
  PGPORT: url.port || "5432",
  PGDATABASE: url.pathname.replace(/^\//, ""),
  PGUSER: decodeURIComponent(url.username),
  PGPASSWORD: decodeURIComponent(url.password),
};
for (const [key, value] of Object.entries(env)) {
  console.log(`export ${key}=${quote(value)}`);
}
NODE
  )"
  export PGHOST PGPORT PGDATABASE PGUSER PGPASSWORD
}
load_castles_db_env
psql -v ON_ERROR_STOP=1 <<'SQL'
select 1;
create table castles_privilege_check (id integer);
drop table castles_privilege_check;
SQL
sudo /usr/bin/npm run server:check-config -- --env-file /etc/castles/castles.env
```

The `load_castles_db_env` helper above is reused by the verification snippet below. Keep these PostgreSQL commands in the same shell session.

Install service/proxy config:

```bash
if [ -f /etc/systemd/system/castles-node.service ]; then
  sudo diff -u /etc/systemd/system/castles-node.service deploy/systemd/castles-node.service || {
    echo "Systemd config drift shown above. The live service is still running."
    echo "Continue only if this diff is expected."
    exit 1
  }
else
  echo "No existing systemd unit found; this looks like a first deploy."
fi

if [ -f /etc/nginx/sites-available/castles ]; then
  sudo diff -u /etc/nginx/sites-available/castles deploy/nginx/castles.conf || {
    echo "Nginx config drift shown above. The live service is still running."
    echo "Continue only if this diff is expected."
    exit 1
  }
else
  echo "No existing nginx site config found; this looks like a first deploy."
fi

sudo cp deploy/systemd/castles-node.service /etc/systemd/system/castles-node.service
sudo cp deploy/nginx/castles.conf /etc/nginx/sites-available/castles
sudo ln -sfn /etc/nginx/sites-available/castles /etc/nginx/sites-enabled/castles

sudo nginx -t || {
  echo "Nginx config failed. Restoring backed-up config; the live service was not stopped."
  if [ -f "$backup/nginx-castles.conf" ]; then
    sudo cp "$backup/nginx-castles.conf" /etc/nginx/sites-available/castles
  else
    sudo rm -f /etc/nginx/sites-available/castles
    sudo rm -f /etc/nginx/sites-enabled/castles
  fi
  exit 1
}
sudo /usr/bin/npm run server:check-config -- --env-file /etc/castles/castles.env
```

The config check replays the online store before the live service is stopped. If it fails with old beta event rows, v1 action events missing `clientActionId`, or missing credential rows, reset disposable beta online data after confirming the backup above exists and only while the app still has no real users:

```bash
load_castles_db_env
psql -v ON_ERROR_STOP=1 <<'SQL'
truncate table
  online_game_events,
  online_game_credentials,
  online_game_summaries,
  online_game_locks
restart identity;
SQL
sudo /usr/bin/npm run server:check-config -- --env-file /etc/castles/castles.env
```

Only stop and restart the service after `server:check-config` passes:

```bash
sudo systemctl daemon-reload
sudo systemctl stop castles-node.service
sudo systemctl start castles-node.service
sudo systemctl reload nginx
```

## 4. Verify

```bash
sudo systemctl status castles-node.service --no-pager
sudo journalctl -u castles-node.service -n 80 --no-pager
curl -I http://castles.ls314.com/api/health
curl -sS https://castles.ls314.com/api/health
node scripts/deploy/check-online-smoke.mjs https://castles.ls314.com "$sha"
npm run online:smoke:browser -- https://castles.ls314.com "$sha"
```

Then manually open two browser sessions:

- create an online game,
- join from the invite link,
- make one move or pass,
- restart the service with `sudo systemctl restart castles-node.service`,
- reload both browsers and confirm the game returns at the latest move.

Confirm health reports `"backend":"postgres"` and inspect the table without printing credentials:

```bash
curl -sS https://castles.ls314.com/api/health | grep postgres
load_castles_db_env
psql -c "select count(*) from online_game_events;"
psql -c "select count(*) from online_game_credentials;"
```

## 5. Emergency Disable

Use this when the app is causing harm and the fastest safe action is to take it offline before a full rollback:

```bash
sudo systemctl stop castles-node.service
sudo systemctl disable castles-node.service
curl -sS -o /dev/null -w "%{http_code}\n" https://castles.ls314.com/api/health || true
sudo journalctl -u castles-node.service -n 80 --no-pager
```

If nginx itself must stop serving the site:

```bash
sudo rm -f /etc/nginx/sites-enabled/castles
sudo nginx -t
sudo systemctl reload nginx
curl -I https://castles.ls314.com || true
```

Re-enable only after a reviewed fix or rollback is ready:

```bash
sudo ln -sfn /etc/nginx/sites-available/castles /etc/nginx/sites-enabled/castles
sudo systemctl enable castles-node.service
sudo systemctl start castles-node.service
sudo nginx -t
sudo systemctl reload nginx
curl -sS https://castles.ls314.com/api/health
```

## 6. Rollback

Use the backup folder created in step 2:

```bash
backup="/home/lukasz/deploy-backups/castles-YYYYMMDD-HHMMSS"
old_sha="$(cat "$backup/old-sha.txt")"

cd /home/lukasz/Castles
sudo systemctl stop castles-node.service
git checkout "$old_sha"
npm ci
npm run build
npm run server:build

if [ -f "$backup/nginx-castles.conf" ]; then
  sudo cp "$backup/nginx-castles.conf" /etc/nginx/sites-available/castles
else
  sudo rm -f /etc/nginx/sites-available/castles
fi
if [ -f "$backup/castles-node.service" ]; then
  sudo cp "$backup/castles-node.service" /etc/systemd/system/castles-node.service
else
  sudo rm -f /etc/systemd/system/castles-node.service
fi
if [ -f "$backup/castles.env" ]; then
  sudo cp "$backup/castles.env" /etc/castles/castles.env
fi
if [ -s "$backup/nginx-enabled-target.txt" ]; then
  sudo ln -sfn "$(cat "$backup/nginx-enabled-target.txt")" /etc/nginx/sites-enabled/castles
else
  sudo rm -f /etc/nginx/sites-enabled/castles
fi
sudo nginx -t
sudo systemctl daemon-reload
sudo systemctl start castles-node.service
sudo systemctl reload nginx

curl -sS https://castles.ls314.com/api/health
sudo journalctl -u castles-node.service -n 80 --no-pager
```

If dependencies changed between the old and new commit, `npm ci` is required during rollback.
