import React from 'react';
import '../css/Board.css'; // Reusing global styles for now

interface MainMenuProps {
    onPlay: () => void;
    onEditor: () => void;
}

const MainMenu: React.FC<MainMenuProps> = ({ onPlay, onEditor }) => {
    return (
        <div className="main-menu" style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100vh',
            color: 'white',
            background: '#2c3e50'
        }}>
            <h1 style={{ fontSize: '4rem', marginBottom: '2rem' }}>CASTLES</h1>
            <div style={{ display: 'flex', gap: '20px' }}>
                <button 
                    onClick={onPlay}
                    style={{
                        padding: '15px 30px',
                        fontSize: '1.5rem',
                        cursor: 'pointer',
                        borderRadius: '8px',
                        border: 'none',
                        background: '#e74c3c',
                        color: 'white'
                    }}
                >
                    New Game
                </button>
                <button 
                    onClick={onEditor}
                    style={{
                        padding: '15px 30px',
                        fontSize: '1.5rem',
                        cursor: 'pointer',
                        borderRadius: '8px',
                        border: 'none',
                        background: '#3498db',
                        color: 'white'
                    }}
                >
                    Map Editor
                </button>
            </div>
        </div>
    );
};

export default MainMenu;
