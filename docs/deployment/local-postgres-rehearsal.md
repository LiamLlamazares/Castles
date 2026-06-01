# Local PostgreSQL Rehearsal

Use this before asking the server owner to update the live server. It proves the online game can survive a Node server restart while using PostgreSQL.

## 1. Check PostgreSQL

```powershell
psql --version
```

If that command is not found, install PostgreSQL 18:

```powershell
winget install -e --id PostgreSQL.PostgreSQL.18 --source winget
```

After installation, `psql.exe` is usually here:

```powershell
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" --version
```

## 2. Create a Local App Database

Run this from PowerShell. It will ask for the PostgreSQL admin password chosen during installation.
If PostgreSQL was installed silently by `winget`, try `postgres` for this local-only password.

```powershell
$psqlCommand = Get-Command psql -ErrorAction SilentlyContinue
if ($psqlCommand) {
  $psql = $psqlCommand.Source
} elseif (Test-Path "C:\Program Files\PostgreSQL\18\bin\psql.exe") {
  $psql = "C:\Program Files\PostgreSQL\18\bin\psql.exe"
} else {
  throw "psql.exe was not found. Add PostgreSQL's bin folder to PATH or install PostgreSQL 18."
}

@"
DO `$`$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'castles_local') THEN
    CREATE ROLE castles_local LOGIN PASSWORD 'castles_local_dev';
  ELSE
    ALTER ROLE castles_local WITH PASSWORD 'castles_local_dev';
  END IF;
END;
`$`$;
SELECT 'CREATE DATABASE castles_local OWNER castles_local'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'castles_local')\gexec
GRANT ALL PRIVILEGES ON DATABASE castles_local TO castles_local;
"@ | & $psql -U postgres -h localhost -d postgres -v ON_ERROR_STOP=1
```

Check the app user can connect:

```powershell
$env:PGPASSWORD="castles_local_dev"
& $psql -U castles_local -h localhost -d castles_local -c "select 1;"
Remove-Item Env:\PGPASSWORD
```

## 3. Run the Restart Smoke Check

```powershell
$env:DATABASE_URL="postgresql://castles_local:castles_local_dev@localhost:5432/castles_local"
$env:ONLINE_STORE_BACKEND="postgres"
$env:PUBLIC_BASE_URL="http://127.0.0.1:3000"
$env:CASTLES_REQUIRE_STATIC_DIR="1"
$env:NODE_ENV="production"
$env:BUILD_ID="local-rehearsal"
$env:GIT_COMMIT="0123456789abcdef0123456789abcdef01234567"
npm run build
npm run server:build
npm run server:check-config
$env:NODE_ENV="test"
npm run online:smoke:local
npm run online:smoke:local:concurrency
```

The smoke script refuses non-local database hosts by default. Do not point `DATABASE_URL` at the live server database. If you intentionally use a disposable remote test database, set:

```powershell
$env:CASTLES_ALLOW_NONLOCAL_SMOKE_DB="1"
```

Expected result:

```text
Local restart smoke passed on http://127.0.0.1:<port> using game <game-id>
Local PostgreSQL concurrency smoke passed using game <game-id>
```

What this checks:

- starts the built Node server on a private local port,
- confirms `/api/health` reports PostgreSQL,
- creates an online game,
- joins over WebSocket,
- submits one `PASS`,
- confirms the snapshot advanced to version 1,
- asks the local server to run its graceful shutdown path,
- restarts the server,
- fetches the same game and confirms version 1 is still there.

The concurrency smoke additionally:

- opens two independent PostgreSQL store connections,
- creates one disposable game in the local database,
- submits the same base-version action concurrently from both stores,
- confirms exactly one action is accepted and the other returns a stale-action snapshot at the committed version,
- submits a follow-up action from the second store and confirms the event log and summary reach version 2.

Do not point this script at the live database. The live server check remains:

```powershell
node scripts/deploy/check-online-smoke.mjs https://castles.ls314.com <reviewed-commit-sha>
npm run online:smoke:browser -- https://castles.ls314.com <reviewed-commit-sha>
```
