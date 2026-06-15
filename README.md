# Castles

Castles is a fantasy hex strategy game with local play, replay/analysis, PGN import/export, a local game library, and a random AI opponent.

## Scripts

Run these commands from the project root.

### `npm start`

Starts the development server.\
Open [http://localhost:3000](http://localhost:3000) to view it in the browser.

### `npm test`

Starts the Jest test runner in watch mode.

### `npm run build`

Builds a production bundle into `build/`.

## Project Overview

The app is organized around a React UI and a TypeScript game engine.

### Directory Structure

*   **`src/Classes/`**: Core game logic, rules systems, notation, AI, and persistence services.
*   **`src/components/`**: React UI components for the board, setup, HUD, rules, tutorial, and library.
*   **`src/rules/`**: Canonical in-app rules content used by the rules manual and modal.
*   **`src/tutorial/`**: Tutorial lesson definitions and tutorial index.
*   **`src/Assets/`**: Piece, terrain, icon, and sound assets.
*   **`src/hooks/`**: Game interaction, analysis, persistence, AI, and input hooks.

## Rules

The canonical rules source is the in-app rules content in `src/rules/rulesContent.ts`. Use the Rules page in the app for the player-facing reference.

## Online Server

Online multiplayer uses the Node server in `server/` with PostgreSQL persistence. Production should set `ONLINE_STORE_BACKEND=postgres`, `CASTLES_DEPLOYMENT_MODE=single-node`, and a secret `DATABASE_URL` in the server environment; do not commit database credentials. Multi-instance mode is intentionally rejected until shared presence/fanout exists. The production runbook is [docs/deployment/castles-server.md](docs/deployment/castles-server.md).

## Documentation

*   **`docs/architecture.md`**: Current architecture and source-of-truth boundaries.
*   **`docs/ai-agent-api.md`**: Current AI agent interface and command boundary.
*   **`docs/online-multiplayer-plan.md`**: Future online multiplayer architecture notes.
*   **`docs/deployment/castles-server.md`**: Fresh server reinstall and production deployment runbook for the online Node service.
*   **`docs/game-mechanics-research.md`**: Long-form mechanics research notes.

## Notes

Runtime logs, build output, coverage, and dependency folders are ignored. Do not commit generated output files.
