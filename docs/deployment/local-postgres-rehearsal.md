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
SELECT 'CREATE DATABASE castles_restore OWNER castles_local'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'castles_restore')\gexec
GRANT ALL PRIVILEGES ON DATABASE castles_local TO castles_local;
GRANT ALL PRIVILEGES ON DATABASE castles_restore TO castles_local;
"@ | & $psql -U postgres -h localhost -d postgres -v ON_ERROR_STOP=1
```

Check the app user can connect:

```powershell
$env:PGPASSWORD="castles_local_dev"
& $psql -U castles_local -h localhost -d castles_local -c "select 1;"
& $psql -U castles_local -h localhost -d castles_restore -c "select 1;"
Remove-Item Env:\PGPASSWORD
```

If an old local rehearsal database contains incompatible pre-release games, reset only the local app tables instead of adding legacy compatibility:

```powershell
& $psql "postgresql://castles_local:castles_local_dev@localhost:5432/castles_local" -Atc "select current_database(), current_user, inet_server_addr(), inet_server_port();"
& $psql "postgresql://castles_local:castles_local_dev@localhost:5432/castles_local" -v ON_ERROR_STOP=1 -c "TRUNCATE TABLE online_game_events, online_game_credentials, online_game_summaries, online_game_locks, online_challenge_events, online_challenge_credentials, online_challenge_summaries, online_challenge_locks, online_seek_events, online_seek_credentials, online_seek_summaries, online_seek_locks RESTART IDENTITY;"
```

Only run that reset after the first command shows `castles_local` on localhost. Do not run it against the live database.

## 3. Run the Restart Smoke Check

```powershell
$env:DATABASE_URL="postgresql://castles_local:castles_local_dev@localhost:5432/castles_local"
$env:ONLINE_STORE_BACKEND="postgres"
$env:PUBLIC_BASE_URL="http://127.0.0.1:3000"
$env:POSTGRES_POOL_MAX_PER_STORE="5"
$env:CASTLES_REQUIRE_STATIC_DIR="1"
$env:NODE_ENV="production"
$env:BUILD_ID="local-rehearsal"
$env:GIT_COMMIT="0123456789abcdef0123456789abcdef01234567"
npm run build
npm run server:build
npm run server:check-config
npm run online:smoke:local:preflight
$env:NODE_ENV="test"
npm run online:smoke:local
npm run online:smoke:local:concurrency
$env:SMOKE_LOAD_GAMES="4"
npm run online:smoke:local:load
Remove-Item Env:\SMOKE_LOAD_GAMES
npm run online:smoke:local:challenges
npm run online:smoke:local:browser
```

New before public-scale traffic: run a JSON backup restore drill against the disposable
`castles_restore` database. This command truncates only the known `online_*` tables in the
restore target after creating the current online schema there, then restores the JSON rows and
compares per-table counts. Do not point `RESTORE_DATABASE_URL` at `castles_local` or production.

```powershell
New-Item -ItemType Directory -Force artifacts/local-postgres | Out-Null
npm run online:backup:postgres -- artifacts/local-postgres/online-postgres.json
$env:RESTORE_DATABASE_URL="postgresql://castles_local:castles_local_dev@localhost:5432/castles_restore"
npm run online:restore:postgres:drill -- artifacts/local-postgres/online-postgres.json
Remove-Item Env:\RESTORE_DATABASE_URL
```

The smoke scripts refuse non-local database hosts by default, and the preflight verifies that `DATABASE_URL` connects to database `castles_local` as user `castles_local`. This protects against accidentally running destructive local smoke games through a localhost SSH tunnel to a live database. Do not point `DATABASE_URL` at the live server database. If you intentionally use a disposable remote or custom local test database, set:

```powershell
$env:CASTLES_ALLOW_DISPOSABLE_SMOKE_DB="1"
```

The older `CASTLES_ALLOW_NONLOCAL_SMOKE_DB=1` override still works, but prefer `CASTLES_ALLOW_DISPOSABLE_SMOKE_DB=1` because it describes the safety requirement more accurately.

Expected result:

```text
Local restart smoke passed on http://127.0.0.1:<port> using game <game-id>
Local PostgreSQL concurrency smoke passed using game <game-id>
Local PostgreSQL load smoke passed: games=4 completed=4 acceptedActions=8 staleRejections=4 aggregateGameDurationMs=<duration> maxGameDurationMs=<duration>
Local PostgreSQL challenge HTTP smoke passed using challenge <challenge-id> and game <game-id>
Local built-server browser smoke passed on http://127.0.0.1:<port>
PostgreSQL restore drill restored <row-count> rows from 24 tables.
Restore drill target: postgresql://<user>@localhost:5432/castles_restore
```

What this checks:

- the preflight confirms the built client/server artifacts exist, `DATABASE_URL` is local or explicitly marked disposable, `psql` is installed or configured with `PSQL_PATH` or `PGCLIENT_BIN`, and the database identity is safe for local smoke;
- starts the built Node server on a private local port,
- confirms `/api/health` reports PostgreSQL,
- creates an online game,
- joins over WebSocket,
- submits one `PASS`,
- confirms the snapshot advanced to version 1,
- asks the local server to run its graceful shutdown path,
- restarts the server,
- fetches the same game and confirms version 1 is still there,
- resigns the restarted smoke game with the opposite seat at version 1, then confirms the terminal spectator snapshot reaches version 2 with a resignation result so the rehearsal does not leave an active smoke game behind.

The concurrency smoke additionally:

- opens two independent PostgreSQL store connections,
- creates one disposable game in the local database,
- submits the same base-version action concurrently from both stores,
- confirms exactly one action is accepted and the other returns a stale-action snapshot at the committed version,
- submits a follow-up action from the second store and confirms the event log and summary reach version 2.

The load smoke additionally:

- creates several disposable games in parallel using the built PostgreSQL store modules,
- repeats the same concurrent stale-action race per game,
- completes every game by resignation so the local database does not retain active load-smoke games,
- prints only aggregate metrics: game count, completed games, accepted actions, stale rejections, summed per-game duration, and max per-game duration.

The restore drill additionally:

- validates the JSON backup with the full-table restore-readiness gate,
- refuses non-local targets unless `CASTLES_ALLOW_DISPOSABLE_RESTORE_DB=1` is set for an explicitly disposable non-production database,
- refuses ordinary app database names such as `castles_local` by default,
- keeps the disposable database-name guard active even when the non-local host override is set,
- creates the current online PostgreSQL schema in the restore target through the built store modules,
- truncates only the known Castles online tables in the restore target,
- restores every backed-up row, resets serial sequences where needed, and verifies restored row counts match the backup.

The browser smoke additionally:

- starts the built Node server on a private local port,
- opens the built client in Playwright or Chrome,
- checks Online navigation tabs, player/spectator joins, token scrubbing, stale-action recovery, reconnect guards, resignation sync, and the `Invite Friend` challenge flow,
- shuts the local server down through the same private shutdown path.

Do not point this script at the live database. The live server check remains:

```powershell
node scripts/deploy/check-online-smoke.mjs https://castles.ls314.xyz <reviewed-commit-sha>
npm run online:smoke:browser -- https://castles.ls314.xyz <reviewed-commit-sha>
```
