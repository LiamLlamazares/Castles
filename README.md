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

## Notes

Runtime logs, build output, coverage, and dependency folders are ignored. Do not commit generated output files.
