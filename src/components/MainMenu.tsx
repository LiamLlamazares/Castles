import React from 'react';
import '../css/Board.css'; // Reusing global styles for now

interface MainMenuProps {
    onPlay: () => void;
}

const MainMenu: React.FC<MainMenuProps> = ({ onPlay }) => {
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
                        padding: '15px 40px',
                        fontSize: '1.8rem',
                        cursor: 'pointer',
                        borderRadius: '8px',
                        border: 'none',
                        background: '#e74c3c',
                        color: 'white',
                        fontWeight: 'bold',
                        boxShadow: '0 4px 6px rgba(0,0,0,0.2)'
                    }}
                >
                    NEW GAME
                </button>
            </div>
        </div>
    );
};

export default MainMenu;
