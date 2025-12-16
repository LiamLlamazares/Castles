import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import App from './App';

describe('App Flow Integration', () => {
  test('defaults to Game view, handles Resign, Reset, and Setup flow', () => {
    render(<App />);

    // 1. Verify we start in Game view
    // Look for "Resign" button in ControlPanel
    const resignButton = screen.getByText(/Resign/i);
    expect(resignButton).toBeInTheDocument();
    
    // Look for "Pass Move" to confirm GameBoard is rendered
    expect(screen.getByText(/Pass Move/i)).toBeInTheDocument();

    // 2. Click Resign
    fireEvent.click(resignButton);

    // 3. Verify Victory Overlay appears
    // The message might depend on who "resigned" (current player).
    // Just check for the buttons that should appear in the overlay.
    const resetButton = screen.getByText(/Reset Board/i);
    const configButton = screen.getByText(/Configure New Game/i);
    expect(resetButton).toBeInTheDocument();
    expect(configButton).toBeInTheDocument();

    // 4. Click Reset Board
    fireEvent.click(resetButton);

    // 5. Verify Overlay disappears/Game restarts
    // Reset button should be gone (overlay closed)
    expect(resetButton).not.toBeInTheDocument();
    // Should still be in Game view
    expect(screen.getByText(/Resign/i)).toBeInTheDocument();

    // 6. Navigate to Setup
    // Fail->Resign again to get overlay
    fireEvent.click(screen.getByText(/Resign/i));
    fireEvent.click(screen.getByText(/Configure New Game/i));

    // 7. Verify Setup Screen
    // Look for "Board Size" or "Random Castles" label
    expect(screen.getByText(/Board Size/i)).toBeInTheDocument();
    expect(screen.getByText(/Random Castles/i)).toBeInTheDocument();

    // 8. Start Game from Setup
    const playButton = screen.getByText(/PLAY GAME/i);
    fireEvent.click(playButton);

    // 9. Verify back in Game
    expect(screen.getByText(/Resign/i)).toBeInTheDocument();
  });
});
