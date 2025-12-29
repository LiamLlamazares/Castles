/**
 * @file CooldownPopup.tsx
 * @description Modal popup for editing sanctuary cooldown value.
 */
import React, { useState } from 'react';
import { Sanctuary } from '../Classes/Entities/Sanctuary';
import { SanctuaryConfig } from '../Constants';

interface CooldownPopupProps {
  sanctuary: Sanctuary;
  onSave: (cooldown: number) => void;
  onClose: () => void;
}

const CooldownPopup: React.FC<CooldownPopupProps> = ({
  sanctuary,
  onSave,
  onClose,
}) => {
  const [cooldown, setCooldown] = useState<number>(sanctuary.cooldown);
  
  const sanctuaryName = sanctuary.type.replace(/([A-Z])/g, ' $1').trim();
  const tier = SanctuaryConfig[sanctuary.type].tier;

  const handleSave = () => {
    onSave(Math.max(0, Math.min(10, cooldown)));
  };

  return (
    <div 
      className="cooldown-popup-overlay"
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div 
        className="cooldown-popup"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'linear-gradient(135deg, #2d3436 0%, #1a1a2e 100%)',
          borderRadius: '16px',
          padding: '24px 32px',
          minWidth: '320px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
          border: '1px solid rgba(255,255,255,0.1)',
        }}
      >
        <h2 style={{ 
          margin: '0 0 8px 0', 
          color: '#fff',
          fontSize: '1.3rem',
        }}>
          Edit Shrine Cooldown
        </h2>
        
        <div style={{ 
          marginBottom: '20px',
          padding: '12px',
          background: 'rgba(255,255,255,0.05)',
          borderRadius: '8px',
        }}>
          <div style={{ color: '#ccc', fontSize: '0.9rem' }}>
            <strong style={{ color: '#fff' }}>{sanctuaryName}</strong>
            <span style={{ 
              marginLeft: '8px',
              background: 'rgba(74, 144, 226, 0.3)',
              padding: '2px 8px',
              borderRadius: '4px',
              fontSize: '0.75rem',
            }}>
              Tier {tier}
            </span>
          </div>
          <div style={{ color: '#888', fontSize: '0.8rem', marginTop: '4px' }}>
            Position: ({sanctuary.hex.q}, {sanctuary.hex.r}, {sanctuary.hex.s})
          </div>
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label style={{ 
            display: 'block', 
            marginBottom: '8px', 
            color: '#ccc',
            fontSize: '0.85rem',
          }}>
            Cooldown Turns (0 = Ready)
          </label>
          <input
            type="number"
            min={0}
            max={10}
            value={cooldown}
            onChange={(e) => setCooldown(parseInt(e.target.value) || 0)}
            style={{
              width: '100%',
              padding: '12px 16px',
              fontSize: '1.1rem',
              background: 'rgba(255,255,255,0.1)',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: '8px',
              color: '#fff',
              outline: 'none',
            }}
          />
          <div style={{ 
            marginTop: '8px',
            display: 'flex',
            gap: '8px',
          }}>
            {[0, 1, 3, 5].map((val) => (
              <button
                key={val}
                onClick={() => setCooldown(val)}
                style={{
                  flex: 1,
                  padding: '8px',
                  background: cooldown === val ? 'rgba(74, 144, 226, 0.4)' : 'rgba(255,255,255,0.05)',
                  border: cooldown === val ? '1px solid #4a90e2' : '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '6px',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                }}
              >
                {val}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={onClose}
            style={{
              flex: 1,
              padding: '12px',
              background: 'rgba(255,255,255,0.1)',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: '8px',
              color: '#ccc',
              cursor: 'pointer',
              fontSize: '0.95rem',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            style={{
              flex: 1,
              padding: '12px',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              border: 'none',
              borderRadius: '8px',
              color: '#fff',
              cursor: 'pointer',
              fontSize: '0.95rem',
              fontWeight: 600,
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
};

export default CooldownPopup;
