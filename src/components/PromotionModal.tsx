/**
 * @file PromotionModal.tsx
 * @description Modal for selecting a piece type when a Swordsman reaches promotion.
 */
import React from 'react';
import { PieceType, PROMOTABLE_TYPES, Color } from '../Constants';
import { Piece } from '../Classes/Entities/Piece';
import { getImageByPieceType } from './PieceImages';

interface PromotionModalProps {
  color?: Color;
  playerColor?: Color;
  promotion?: Piece;
  onSelect: (type: PieceType) => void;
}

const PromotionModal: React.FC<PromotionModalProps> = ({ color, playerColor, promotion, onSelect }) => {
  const pieceColor = color ?? playerColor ?? promotion?.color ?? 'w';
  return (
    <div className="promotion-backdrop" onClick={(e) => e.stopPropagation()}>
      <div className="promotion-modal">
        <h3 className="promotion-title">Promote Swordsman</h3>
        <p className="promotion-subtitle">Choose a piece type:</p>
        <div className="promotion-grid">
          {PROMOTABLE_TYPES.map((type) => (
            <button
              key={type}
              className="promotion-option"
              onClick={() => onSelect(type)}
              title={type}
            >
              <img
                src={getImageByPieceType(type, pieceColor)}
                alt={type}
                className="promotion-piece-img"
              />
              <span className="promotion-label">{type}</span>
            </button>
          ))}
        </div>
      </div>

      <style>{`
        .promotion-backdrop {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.7);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }
        .promotion-modal {
          background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
          border: 2px solid rgba(255, 215, 0, 0.4);
          border-radius: 16px;
          padding: 28px 32px;
          max-width: 520px;
          width: 90%;
          box-shadow: 0 12px 40px rgba(0, 0, 0, 0.6);
        }
        .promotion-title {
          color: #ffd700;
          text-align: center;
          margin: 0 0 4px;
          font-size: 1.4rem;
        }
        .promotion-subtitle {
          color: #aaa;
          text-align: center;
          margin: 0 0 20px;
          font-size: 0.9rem;
        }
        .promotion-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 10px;
        }
        .promotion-option {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
          padding: 12px 8px;
          background: rgba(255, 255, 255, 0.06);
          border: 2px solid rgba(255, 255, 255, 0.15);
          border-radius: 10px;
          cursor: pointer;
          transition: all 0.15s ease;
          color: #ddd;
          font-size: 0.75rem;
        }
        .promotion-option:hover {
          background: rgba(255, 215, 0, 0.15);
          border-color: rgba(255, 215, 0, 0.5);
          transform: translateY(-2px);
        }
        .promotion-piece-img {
          width: 48px;
          height: 48px;
          object-fit: contain;
        }
        .promotion-label {
          font-weight: 600;
        }
      `}</style>
    </div>
  );
};

export default PromotionModal;
