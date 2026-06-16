# Castles Server Deployment Runbook

This runbook deploys one private-beta Node process behind nginx. It is written for the current server layout, but the domain and database values are deliberately parameterized so a fresh server can be rebuilt from zero.

Do not deploy from a dirty worktree, a moving branch name, or an unreviewed commit. Use an exact commit SHA.

Before copying commands to another host, replace these site-specific values everywhere they appear:

```text
linux user:        lukasz
repo path:         /home/lukasz/Castles
app domain:        castles.ls314.com
node port:         3000
systemd env file:  /etc/castles/castles.env
database name:     castles
database user:     castles
```

`deploy/systemd/castles-node.service` is committed for the current `lukasz` and `/home/lukasz/Castles` layout. If you change the linux user or repo path above, edit the service unit in the repo before copying it, or the validation step below must fail.

The server must have Node, npm, git, nginx, and certbot. PostgreSQL only has to run on this server when `DATABASE_URL` points to localhost. If `DATABASE_URL` points to a managed or separate PostgreSQL host, do not install a local PostgreSQL server just for Castles; use the remote PostgreSQL URL in `/etc/castles/castles.env`. `psql` and `pg_dump` are still useful on the app server for verification and full SQL backups, but they are client tools in that setup. If `pg_dump` is unavailable during a UI-only/private-beta deploy, `scripts/deploy/postgres-online-backup.mjs` can write a JSON snapshot of the known Castles `online_*` tables through the app's Node PostgreSQL client.

Use the public app domain, such as `castles.ls314.com` or `castles.ls314.xyz`, for `PUBLIC_BASE_URL`. A host/admin alias such as `contabo.ls314.xyz` can be useful for SSH or server management, but it should not become `PUBLIC_BASE_URL` unless players will actually open the app there.

Current `.xyz` lift note, 2026-06-05: `castles.ls314.xyz` and `contabo.ls314.xyz` resolve to the same host and can be used for the deploy SSH reachability check. The root `ls314.xyz` currently resolves elsewhere, so using it as the freshness SSH host can produce a false SSH timeout even while the actual `.xyz` app host is reachable.

Public firewall ports are `80` and `443` for nginx plus `22` for SSH administration. The Node app port, usually `3000`, should stay bound behind nginx and does not need to be public. PostgreSQL port `5432` only needs to be reachable from the app server to the database host; do not open the app server's PostgreSQL port unless PostgreSQL intentionally runs there and external database clients need it.

By default the Node service binds to `127.0.0.1`, so nginx can reach it locally but public clients cannot connect directly to port `3000`. Keep `CASTLES_BIND_HOST=127.0.0.1` for the normal nginx-backed deployment.

The current online service is single-node only. Keep `CASTLES_DEPLOYMENT_MODE=single-node` or leave it unset. The production runtime coordinator now uses PostgreSQL for live spectator presence, selected operation gates, shared rate limits, runtime event outbox records, startup maintenance ownership, and a bounded runtime-event polling scheduler with readiness metadata, but the server still deliberately refuses `CASTLES_DEPLOYMENT_MODE=multi-instance`. Do not run nginx load balancing, PM2 cluster mode, Node cluster workers, or multiple systemd app instances for the same database, even with sticky routing. PostgreSQL runtime stores do not yet provide cross-instance WebSocket fanout, proven warm room cache invalidation/readiness across workers, complete queue/gate coverage, rolling two-instance validation, or `multiInstanceReady`. Before running multiple Node workers or app instances, add those missing runtime pieces, rolling-drain behavior for WebSockets, and multi-instance tests.

## Quick Path: Existing nginx, Remote PostgreSQL

Use this when DNS and nginx are already serving HTTPS and proxying to `127.0.0.1:3000`, and the only missing piece is the Node app service. This is the smallest path for a server "lift" to a new domain.

Do not install PostgreSQL locally in this path. The database is PostgreSQL, but it lives wherever `DATABASE_URL` points. The Node service creates and checks the online game, challenge, lobby, and account/session tables on startup. Keep the real `DATABASE_URL` only in `/etc/castles/castles.env` or the server's secret manager; never commit it.

1. Confirm nginx/DNS and identify whether Node is missing:

```bash
app_domain="<app-domain>"
curl -I "https://${app_domain}/" || true
curl -sS "https://${app_domain}/api/health" || true
curl -sS http://127.0.0.1:3000/api/health || true
sudo nginx -T | grep -E "server_name|127\\.0\\.0\\.1:3000|location /ws" -n
```

If external HTTPS works but `/api/health` returns `502 Bad Gateway`, and the localhost health check fails, nginx is probably fine and the Node service is not running or not listening on port `3000`.

2. Install the system tools if they are missing:

```bash
sudo apt update
sudo apt install -y git nginx certbot python3-certbot-nginx curl postgresql-client
if [ ! -x /usr/bin/node ] || [ ! -x /usr/bin/npm ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt install -y nodejs
fi
/usr/bin/node --version
/usr/bin/npm --version
```

3. Clone or update the reviewed commit:

```bash
deploy_user="lukasz"
repo="/home/${deploy_user}/Castles"
sha="<40-character-reviewed-commit-sha>"

if [ ! -d "$repo/.git" ]; then
  sudo -u "$deploy_user" git clone https://github.com/LiamLlamazares/Castles.git "$repo"
fi

cd "$repo"
sudo -u "$deploy_user" git fetch origin online-action-log
sudo -u "$deploy_user" git checkout --detach "$sha"
test "$(sudo -u "$deploy_user" git rev-parse HEAD)" = "$sha"
sudo -u "$deploy_user" npm ci
sudo -u "$deploy_user" npm run build
sudo -u "$deploy_user" npm run server:build
```

4. Create or update `/etc/castles/castles.env` without committing secrets:

```bash
app_domain="<app-domain>"
sha="<40-character-reviewed-commit-sha>"
repo="/home/lukasz/Castles"
sudo install -d -m 700 /etc/castles
sudo tee /etc/castles/castles.env >/dev/null <<ENV
NODE_ENV=production
PORT=3000
CASTLES_BIND_HOST=127.0.0.1
PUBLIC_BASE_URL=https://${app_domain}
CASTLES_DEPLOYMENT_MODE=single-node
ONLINE_STORE_BACKEND=postgres
DATABASE_URL=postgresql://<user>:<url-encoded-password>@<postgres-host>:5432/<database>
POSTGRES_POOL_MAX_PER_STORE=5
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
GOOGLE_OAUTH_REDIRECT_URI=
CASTLES_ADMIN_BEARER_TOKEN=
CASTLES_STATIC_DIR=${repo}/build
CASTLES_REQUIRE_STATIC_DIR=1
BUILD_ID=$(date -u +%Y%m%d-%H%M%S)
GIT_COMMIT=${sha}
ENV
sudo chmod 600 /etc/castles/castles.env
```

For the current remote-database setup, the database host should be the provided PostgreSQL host, not `localhost`. URL-encode the username and password inside `DATABASE_URL`; do not paste raw values containing `@`, `#`, `?`, `&`, `/`, or spaces into the URL. Google OAuth is optional; leave the Google variables empty to disable it. If enabled, authorize `${PUBLIC_BASE_URL}/api/online/account/oauth/google/callback` in Google Cloud, or set `GOOGLE_OAUTH_REDIRECT_URI` to the exact authorized callback URL. `CASTLES_ADMIN_BEARER_TOKEN` is optional and disables the admin report queue when empty; when enabled, use a generated token at least 24 characters long with no whitespace and keep it out of Git, logs, and shell history.

5. Verify the remote database connection from the app server:

```bash
db_url="$(sudo awk -F= '$1=="DATABASE_URL"{print substr($0, index($0, "=") + 1)}' /etc/castles/castles.env)"
psql "$db_url" -c "select 1 as castles_db_ready;"
```

If this fails, fix the database URL, database firewall/allowlist, user permissions, or SSL mode before starting Node.

6. Install and restart the Node service:

```bash
deploy_user="lukasz"
repo="/home/${deploy_user}/Castles"
cd "$repo"
grep -qx "User=${deploy_user}" deploy/systemd/castles-node.service
grep -qx "WorkingDirectory=${repo}" deploy/systemd/castles-node.service
sudo cp deploy/systemd/castles-node.service /etc/systemd/system/castles-node.service
sudo systemctl daemon-reload
sudo /usr/bin/npm run server:check-config -- --env-file /etc/castles/castles.env
sudo systemctl enable castles-node.service
sudo systemctl restart castles-node.service
systemctl is-active castles-node.service
curl -sS http://127.0.0.1:3000/api/health
```

7. Verify through the public domain:

```bash
app_domain="<app-domain>"
sha="<40-character-reviewed-commit-sha>"
curl -sS "https://${app_domain}/api/health"
npm run online:deploy:freshness
node scripts/deploy/check-online-smoke.mjs "https://${app_domain}" "$sha"
npm run online:smoke:browser -- "https://${app_domain}" "$sha"
```

`online:deploy:freshness` is a fast diagnostic before the mutating smoke checks. With no arguments, it checks the default production domain against the local Git `HEAD`, verifies that commit against the tracked upstream branch, reports when the production health commit is a known ancestor behind upstream, and checks TCP reachability to the default deploy host on port 22. Pass `npm run online:deploy:freshness -- "https://${app_domain}" "$sha" "${ssh_host:-$app_domain}"` when verifying a different app domain or reviewed SHA. If the expected SHA is already on the upstream branch but health is stale, the push target is not the likely failure mode; focus on the deploy/restart path. An SSH failure means the chosen deploy host is unavailable; confirm the SSH host resolves to the same server as the app domain before treating it as a service outage.
`check-online-smoke.mjs` also verifies that Google OAuth is enabled, that the OAuth start route redirects to Google, and that the redirect callback URL matches the deployed app domain. For intentionally OAuth-free staging hosts, add a separate staging smoke rather than weakening the production gate.

If localhost health works but public health fails, the remaining problem is nginx, SSL, DNS, or firewall routing rather than the Node app. If `server:check-config` fails, fix the PostgreSQL URL, permissions, schema-readiness error, or deployment-mode guard before restarting. `server:check-config` reports `onlineDeployment.mode: "single-node"` and `/api/health` reports `online.deployment.mode: "single-node"` with `multiInstanceReady: false`; do not reinterpret that as a capacity or autoscaling signal. If health works but the browser shows old UI, verify the health commit, hard-refresh once, and rerun the browser smoke; the current app is designed to bypass stale app-shell caching after deploys.

## 0. Fresh Server Reinstall From Zero

Use this section when rebuilding a new host. It intentionally does not include real secrets; replace every placeholder before running it.

1. Create or verify the deployment user and home directory:

```bash
deploy_user="lukasz"
if ! id "$deploy_user" >/dev/null 2>&1; then
  sudo adduser --disabled-password --gecos "" "$deploy_user"
fi
deploy_group="$(id -gn "$deploy_user")"
if [ ! -d "/home/$deploy_user" ]; then
  sudo install -d -o "$deploy_user" -g "$deploy_group" -m 750 "/home/$deploy_user"
fi
test "$(stat -c %U "/home/$deploy_user")" = "$deploy_user"
sudo -u "$deploy_user" test -w "/home/$deploy_user"
```

If the same account will be used for SSH-based deploys, add its SSH key and sudo policy separately before continuing.

2. Install system packages:

```bash
sudo apt update
sudo apt install -y git nginx certbot python3-certbot-nginx curl postgresql-client
if [ ! -x /usr/bin/node ] || [ ! -x /usr/bin/npm ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt install -y nodejs
fi
/usr/bin/node --version
/usr/bin/npm --version
```

The systemd unit uses `/usr/bin/npm`, so Node must be installed system-wide. An `nvm`-only install can pass an interactive shell check and still fail under systemd. The current service has been verified with Node 22.

3. Clone the reviewed branch and select the exact commit:

```bash
deploy_user="lukasz"
repo="/home/${deploy_user}/Castles"
sha="<40-character-reviewed-commit-sha>"
sudo -u "$deploy_user" git clone https://github.com/LiamLlamazares/Castles.git "$repo"
cd "$repo"
sudo -u "$deploy_user" git fetch origin online-action-log
sudo -u "$deploy_user" git checkout --detach "$sha"
test "$(sudo -u "$deploy_user" git rev-parse HEAD)" = "$sha"
```

4. Install dependencies and build:

```bash
deploy_user="lukasz"
repo="/home/${deploy_user}/Castles"
cd "$repo"
sudo -u "$deploy_user" npm ci
sudo -u "$deploy_user" npm run build
sudo -u "$deploy_user" npm run server:build
```

5. Create the production env file:

```bash
sudo install -d -m 700 /etc/castles
sudo tee /etc/castles/castles.env >/dev/null <<'ENV'
NODE_ENV=production
PORT=3000
CASTLES_BIND_HOST=127.0.0.1
PUBLIC_BASE_URL=https://<domain>
CASTLES_DEPLOYMENT_MODE=single-node
ONLINE_STORE_BACKEND=postgres
DATABASE_URL=postgresql://<user>:<password>@<postgres-host>:5432/<database>
POSTGRES_POOL_MAX_PER_STORE=5
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
GOOGLE_OAUTH_REDIRECT_URI=
CASTLES_ADMIN_BEARER_TOKEN=
CASTLES_STATIC_DIR=/home/lukasz/Castles/build
CASTLES_REQUIRE_STATIC_DIR=1
BUILD_ID=<timestamp-or-release-id>
GIT_COMMIT=<40-character-reviewed-commit-sha>
ENV
sudo chmod 600 /etc/castles/castles.env
```

For a cloud database, use that cloud host in `DATABASE_URL`. Do not create a local PostgreSQL database unless the URL is intentionally `localhost`. URL-encode the database username and password inside `DATABASE_URL`; for example, a literal password `p@$&;#` becomes `p%40%24%26%3B%23`. Do not paste raw values containing `@`, `#`, `?`, `&`, `/`, or spaces into the URL. Leave `CASTLES_ADMIN_BEARER_TOKEN` empty to disable the protected report queue, or set a generated 24+ character token with no whitespace.

6. Prepare and verify the database connection before starting Node.

For a managed or separate PostgreSQL host, create the database and app user in that provider first, allow this app server to connect through any database firewall, then verify from the app server:

```bash
db_url="$(sudo awk -F= '$1=="DATABASE_URL"{print substr($0, index($0, "=") + 1)}' /etc/castles/castles.env)"
psql "$db_url" -c "select 1 as castles_db_ready;"
```

For a same-server localhost PostgreSQL deployment only, install PostgreSQL and create the database/user locally before running the same `psql` check. Use the raw password in `db_password`; use the URL-encoded form only inside `DATABASE_URL`. If the raw password contains a single quote, write it twice for the SQL literal or choose a different generated password.

```bash
sudo apt install -y postgresql
db_name="<database>"
db_user="<user>"
db_password="<raw-password>"
sudo -u postgres psql <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${db_user}') THEN
    CREATE ROLE ${db_user} LOGIN PASSWORD '${db_password}';
  ELSE
    ALTER ROLE ${db_user} WITH LOGIN PASSWORD '${db_password}';
  END IF;
END
\$\$;
SELECT 'CREATE DATABASE ${db_name} OWNER ${db_user}'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '${db_name}')\gexec
GRANT CONNECT ON DATABASE ${db_name} TO ${db_user};
\c ${db_name}
GRANT USAGE, CREATE ON SCHEMA public TO ${db_user};
SQL
db_url="$(sudo awk -F= '$1=="DATABASE_URL"{print substr($0, index($0, "=") + 1)}' /etc/castles/castles.env)"
psql "$db_url" -c "select 1 as castles_db_ready;"
```

7. Install and start the Node service:

```bash
deploy_user="lukasz"
repo="/home/${deploy_user}/Castles"
cd "$repo"
grep -qx "User=${deploy_user}" deploy/systemd/castles-node.service
grep -qx "WorkingDirectory=${repo}" deploy/systemd/castles-node.service
sudo cp deploy/systemd/castles-node.service /etc/systemd/system/castles-node.service
sudo systemctl daemon-reload
sudo /usr/bin/npm run server:check-config -- --env-file /etc/castles/castles.env
sudo systemctl enable castles-node.service
sudo systemctl restart castles-node.service
systemctl is-active castles-node.service
curl -sS http://127.0.0.1:3000/api/health
```

8. Configure nginx to proxy HTTPS to Node. If certbot already created the site file, confirm it proxies `/`, `/api/online/`, and `/ws` to `http://127.0.0.1:3000` and that `/ws` includes the `Upgrade` and `Connection "upgrade"` headers.

If starting from a server with no nginx site yet, create a temporary HTTP-only proxy first, then let certbot upgrade it to HTTPS:

```bash
domain="<domain>"
sudo tee /etc/nginx/sites-available/castles >/dev/null <<'NGINX'
server {
    listen 80;
    server_name <domain>;

    client_max_body_size 512k;

    location /ws {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
        proxy_buffering off;
    }

    location /api/online/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        add_header Cache-Control "no-store" always;
        add_header Vary "Authorization" always;
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
NGINX
sudo sed -i "s/<domain>/${domain}/g" /etc/nginx/sites-available/castles
sudo ln -sfn /etc/nginx/sites-available/castles /etc/nginx/sites-enabled/castles
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d "$domain"
sudo nginx -t
sudo systemctl reload nginx
```

9. Verify externally:

```bash
sha="<40-character-reviewed-commit-sha>"
curl -sS https://<domain>/api/health
npm run online:deploy:freshness -- https://<domain> "$sha" <ssh-host>
node scripts/deploy/check-online-smoke.mjs https://<domain> "$sha"
npm run online:smoke:browser -- https://<domain> "$sha"
```

If nginx returns `502 Bad Gateway`, first check whether Node is active and listening on port 3000:

```bash
systemctl status castles-node.service --no-pager
ss -ltnp | grep ':3000'
curl -sS http://127.0.0.1:3000/api/health
```

## 1. Preflight

On the server, set the reviewed commit SHA first:

```bash
sha="<40-character-reviewed-commit-sha>"
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
  if command -v pg_dump >/dev/null; then
    pg_dump > "$backup/postgres-online-events.sql"
    test -s "$backup/postgres-online-events.sql" || {
      echo "PostgreSQL backup is empty or failed."
      exit 1
    }
  else
    echo "pg_dump is unavailable; writing JSON backup with the Node PostgreSQL client."
    DATABASE_URL="$db_url" node scripts/deploy/postgres-online-backup.mjs --out "$backup/postgres-online-backup.json"
    test -s "$backup/postgres-online-backup.json" || {
      echo "PostgreSQL JSON backup is empty or failed."
      exit 1
    }
    node scripts/deploy/postgres-online-backup.mjs --validate "$backup/postgres-online-backup.json" --require-all-tables
  fi
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
if [ -n "${backup:-}" ] && [ -f "$backup/postgres-online-backup.json" ]; then
  node scripts/deploy/postgres-online-backup.mjs --validate "$backup/postgres-online-backup.json"
fi
npm ci
npm run build
npm run server:build
```

Do not skip the runtime environment block below when doing a condensed hotfix deploy. Health checks and browser smoke are pinned to `GIT_COMMIT`; if `/etc/castles/castles.env` still points at an older SHA, the service can run new files while `/api/health` correctly reports that the deployed commit contract has not been updated.

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
sudo grep -q "^CASTLES_BIND_HOST=" /etc/castles/castles.env || sudo sh -c 'printf "\nCASTLES_BIND_HOST=127.0.0.1\n" >> /etc/castles/castles.env'
sudo grep -q "^CASTLES_DEPLOYMENT_MODE=" /etc/castles/castles.env || sudo sh -c 'printf "\nCASTLES_DEPLOYMENT_MODE=single-node\n" >> /etc/castles/castles.env'
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
CASTLES_BIND_HOST=127.0.0.1
PUBLIC_BASE_URL=https://castles.ls314.com
CASTLES_DEPLOYMENT_MODE=single-node
ONLINE_STORE_BACKEND=postgres
DATABASE_URL=postgresql://castles:<url-encoded-password>@<postgres-host>:5432/castles
POSTGRES_POOL_MAX_PER_STORE=5
CASTLES_ADMIN_BEARER_TOKEN=
CASTLES_STATIC_DIR=/home/lukasz/Castles/build
CASTLES_REQUIRE_STATIC_DIR=1
BUILD_ID=<timestamp>
GIT_COMMIT=<40-character-reviewed-commit-sha>
```

Create or update the database and app user before starting the service. Replace the password with the same value used in `DATABASE_URL`.

If `DATABASE_URL` points to a managed or separate PostgreSQL host, do this database/user setup on that database host or provider, not on the app server. On the app server, only the env file and connectivity check are required.

Same-server PostgreSQL only: run the local `sudo -u postgres psql` block below only when PostgreSQL intentionally runs on the same server as the app.

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

For a managed or separate PostgreSQL host, the verification block is the same after `load_castles_db_env`, provided the app server has the `psql` client installed and the database firewall allows this server to connect. If the provider does not allow `psql` from the app server, `sudo /usr/bin/npm run server:check-config -- --env-file /etc/castles/castles.env` is the minimum readiness check because it connects through the same Node PostgreSQL client used by the app.

Install service config and verify the existing proxy:

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

sudo cp deploy/systemd/castles-node.service /etc/systemd/system/castles-node.service
sudo nginx -t || {
  echo "Nginx config failed. The live service was not stopped."
  exit 1
}
sudo nginx -T | grep -E "server_name|127\\.0\\.0\\.1:3000|location /ws" -n
sudo /usr/bin/npm run server:check-config -- --env-file /etc/castles/castles.env
```

Do not copy `deploy/nginx/castles.conf` into a working lifted server unless you have reviewed the domain and certificate paths. That committed file is a template for the current `castles.ls314.com` host, and a new domain such as `castles.ls314.xyz` needs its own nginx `server_name` and certificate paths. If an nginx change is part of a reviewed deploy, apply it separately, run `sudo nginx -t`, and reload nginx only after the Node config check passes.

The config check replays the online store before the live service is stopped. If it fails with old beta event rows, v1 action events missing `clientActionId`, or missing credential rows, reset disposable beta online data after confirming the backup above exists and only while the app still has no real users:

```bash
load_castles_db_env
psql -v ON_ERROR_STOP=1 <<'SQL'
truncate table
  online_game_events,
  online_game_credentials,
  online_game_additional_credentials,
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
psql -c "select count(*) from online_game_additional_credentials;"
```

## 4A. Operational Alerts And Incidents

`npm run online:deploy:freshness` prints explicit alert lines before the final freshness status. Treat these as the private-beta incident checklist:

- `Alert: health_not_ok severity=critical`: do not run mutating smoke checks yet. Check `sudo systemctl status castles-node.service --no-pager`, `sudo journalctl -u castles-node.service -n 120 --no-pager`, `curl -sS http://127.0.0.1:3000/api/health`, and `sudo /usr/bin/npm run server:check-config -- --env-file /etc/castles/castles.env`. If this started during a deploy and the previous backup exists, prepare rollback before further changes.
- `Alert: stale_deploy severity=critical`: production is not serving the reviewed commit. Confirm the commit is pushed to `origin/online-action-log`, rerun `npm run online:deploy:freshness -- https://<domain> "$sha" <ssh-host>`, inspect `/etc/castles/castles.env` for `GIT_COMMIT`, and restart `castles-node.service` only after `server:check-config` passes.
- `Alert: store_not_postgres severity=critical`: production health is not reporting the PostgreSQL backend. Check `ONLINE_STORE_BACKEND`, `DATABASE_URL`, database connectivity, and `server:check-config` before accepting the deploy or running player-facing smoke.
- `Alert: deployment_not_single_node severity=critical`: production health is missing the supported single-node guardrail or is advertising unsupported multi-instance readiness. Check `CASTLES_DEPLOYMENT_MODE`, ensure only one Node app instance is serving the database, and do not enable load-balanced app workers until WebSocket fanout, warm-cache invalidation/readiness, full queue/gate coverage, rolling drain, and two-instance tests exist.
- `Alert: ssh_unreachable severity=warning`: the app may still be healthy, but deploy control is degraded. Confirm the SSH host resolves to the intended server, check firewall/provider status, and do not rely on a remote deploy script until SSH reachability is restored or an alternate console path is available.

For machine-readable monitoring or a scheduled private-beta check, use the non-mutating JSON snapshot command. Pin the expected commit to the currently reviewed deployed SHA; if you omit it, the command defaults to the checkout's local `HEAD`, which is useful during deploy verification but can intentionally report a stale deploy after newer commits have been pushed.

```bash
npm run online:monitor:production -- https://castles.ls314.xyz "$sha" contabo.ls314.xyz > "$backup/production-monitoring.json"
```

The JSON includes `severity`, `alerts`, `checks`, and a `pager` block. Exit codes are `0` for healthy, `1` for warning-only alerts such as SSH reachability degradation, and `2` for critical page-worthy alerts such as unhealthy health, stale deploys, or a non-PostgreSQL backend. If health fetching fails before normal checks complete, the command still writes a critical JSON snapshot with a `health_not_ok` alert to stdout and writes a short error line to stderr, so the archived JSON file remains parseable. This is a provider-neutral pager contract; wire it to cron, systemd timers, or an external pager only after confirming where output and exit codes are archived.

For smoke failures:

- API smoke failure after fresh health: stop and inspect the exact failed endpoint or WebSocket step; do not continue to browser smoke until the API smoke passes. Check `journalctl` for matching `online.* failed` log lines and confirm the smoke did not leak bearer tokens in output.
- Browser smoke failure after API smoke passes: capture the Playwright screenshot/video artifacts if available, hard-refresh once to exclude stale app-shell caching, rerun the browser smoke, and only then classify it as a UI regression.
- Local load-smoke failure: rerun `npm run online:smoke:local:preflight`, confirm `DATABASE_URL` points to the disposable local database, then rerun `$env:SMOKE_LOAD_GAMES="4"; npm run online:smoke:local:load`. If stale-action counts differ, treat it as a PostgreSQL transaction/advisory-lock regression.

For JSON backup restore readiness, run the restore drill only against a disposable restore target. The command creates the current online schema in the target, truncates only the known Castles `online_*` tables there, restores rows from the JSON backup, resets serial sequences where needed, and verifies per-table row counts. Do not point `RESTORE_DATABASE_URL` at the live database or the normal local rehearsal database:

```bash
RESTORE_DATABASE_URL="postgresql://<restore-user>:<restore-password>@localhost:5432/castles_restore" \
  npm run online:restore:postgres:drill -- "$backup/postgres-online-backup.json"
```

For a non-local disposable restore target, set `CASTLES_ALLOW_DISPOSABLE_RESTORE_DB=1` only after confirming the target is not production. This override only relaxes the host check; the target database name must still contain `restore`, `drill`, `smoke`, `test`, `tmp`, or `disposable`.

Before any public-scale traffic, archive the freshness output, API smoke output, browser smoke output, local load-smoke output, restore-drill output, and backup path together with the deployed commit SHA.

For a non-mutating production deploy preview, use the dedicated script so npm cannot consume the dry-run flag:

```bash
npm run online:deploy:production:dry-run -- <reviewed-commit-sha> <build-id>
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
