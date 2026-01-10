import React, { useEffect } from "react";
import "../css/RulesModal.css";
import { PieceType } from "../Constants";
import { getImageByPieceType } from "./PieceImages";
import castleImage from "../Assets/Images/Banner/castle.svg";
import bootsImage from "../Assets/Images/Banner/boots.svg";
import swordImage from "../Assets/Images/Banner/sword.svg";

interface RulesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const RulesModal: React.FC<RulesModalProps> = ({ isOpen, onClose }) => {
  // Close on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "";
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="rules-modal-backdrop" onClick={onClose}>
      <div className="rules-modal" onClick={(e) => e.stopPropagation()}>
        <div className="rules-header">
          <h1>🏰 Castles: Game Rules</h1>
          <button className="rules-close" onClick={onClose}>×</button>
        </div>
        
        <div className="rules-content">
          {/* Quick Start */}
          <section id="quick-start">
            <h2>⚡ Quick Start</h2>
            <div className="rules-box highlight">
              <p><strong>Objective:</strong> Capture your opponent's Monarch OR control all 6 castles.</p>
              <p><strong>Each Turn:</strong></p>
              <ol>
                <li>🥾 <strong>Movement</strong> – Move up to 2 pieces</li>
                <li>⚔️ <strong>Attack</strong> – Attack with up to 2 pieces</li>
                <li>🏰 <strong>Castles</strong> – Recruit from controlled castles</li>
              </ol>
            </div>
          </section>

          {/* Game Overview */}
          <section id="game-overview">
            <h2>Game Overview</h2>
            <h3>The Board</h3>
            <div className="rules-grid">
              <div className="rule-tile">
                <svg viewBox="0 0 110 110" className="tile-visual-svg">
                  <polygon points="55 5, 98 27.5, 98 72.5, 55 95, 12 72.5, 12 27.5" className="hexagon" />
                </svg>
                <span><strong>Grass</strong><br/>Standard movement</span>
              </div>
              <div className="rule-tile">
                <svg viewBox="0 0 110 110" className="tile-visual-svg">
                  <polygon points="55 5, 98 27.5, 98 72.5, 55 95, 12 72.5, 12 27.5" className="hexagon-river" />
                </svg>
                <span><strong>River</strong><br/>Impassable (except flying)</span>
              </div>
              <div className="rule-tile">
                <svg viewBox="0 0 110 110" className="tile-visual-svg">
                  <polygon points="55 5, 98 27.5, 98 72.5, 55 95, 12 72.5, 12 27.5" className="hexagon-castles" />
                </svg>
                <span><strong>Castle</strong><br/>Recruitment Center</span>
              </div>
              <div className="rule-tile">
                <svg viewBox="0 0 110 110" className="tile-visual-svg">
                  <polygon points="55 5, 98 27.5, 98 72.5, 55 95, 12 72.5, 12 27.5" className="hexagon-sanctuary hexagon-sanctuary-wizard" />
                </svg>
                <span><strong>Sanctuary</strong><br/>Summoning Circle</span>
              </div>
            </div>

            <h3>Starting Pieces</h3>
            <table className="rules-table">
              <tbody>
                <tr>
                   <td><img src={getImageByPieceType(PieceType.Monarch, 'w')} alt="" className="rule-icon"/> Monarch ×1</td>
                   <td><img src={getImageByPieceType(PieceType.Giant, 'w')} alt="" className="rule-icon"/> Giants ×2</td>
                </tr>
                <tr>
                   <td><img src={getImageByPieceType(PieceType.Dragon, 'w')} alt="" className="rule-icon"/> Dragon ×1</td>
                   <td><img src={getImageByPieceType(PieceType.Eagle, 'w')} alt="" className="rule-icon"/> Eagles ×2</td>
                </tr>
                <tr>
                   <td><img src={getImageByPieceType(PieceType.Assassin, 'w')} alt="" className="rule-icon"/> Assassin ×1</td>
                   <td><img src={getImageByPieceType(PieceType.Trebuchet, 'w')} alt="" className="rule-icon"/> Trebuchets ×2</td>
                </tr>
                <tr>
                   <td><img src={getImageByPieceType(PieceType.Knight, 'w')} alt="" className="rule-icon"/> Knights ×4</td>
                   <td><img src={getImageByPieceType(PieceType.Archer, 'w')} alt="" className="rule-icon"/> Archers ×6</td>
                </tr>
                <tr>
                   <td><img src={getImageByPieceType(PieceType.Swordsman, 'w')} alt="" className="rule-icon"/> Swordsmen ×13</td>
                   <td></td>
                </tr>
              </tbody>
            </table>
          </section>

          {/* Turn Phases */}
          <section id="turn-phases">
            <h2>🔄 Turn Phases</h2>
            <div className="phase-cards">
              <div className="phase-card">
                <h4><img src={bootsImage} alt="" className="phase-icon"/> 1. Movement</h4>
                <p>Move <strong>up to 2 pieces</strong><br/>(or 1 heavy unit)</p>
                <small>Heavy: Monarch, Dragon, Giant, Trebuchet</small>
              </div>
              <div className="phase-card">
                <h4><img src={swordImage} alt="" className="phase-icon"/> 2. Attack</h4>
                <p>Attack with <strong>up to 2 pieces</strong></p>
                <small>Multiple pieces can combine attacks</small>
              </div>
              <div className="phase-card">
                <h4><img src={castleImage} alt="" className="phase-icon"/> 3. Castles</h4>
                <p>Recruit <strong>1 piece per castle</strong></p>
                <small>Order: Swordsman → Archer → Knight → ...</small>
              </div>
            </div>
          </section>

          {/* Special Pieces */}
          <section id="special-pieces">
            <h2>✨ Special Pieces</h2>
            <p>Summoned from <strong>Sanctuaries</strong> across the board.</p>
            <table className="rules-table pieces-table">
              <thead>
                <tr>
                  <th>Piece</th>
                  <th>Movement</th>
                  <th>STR</th>
                  <th>Special Ability</th>
                </tr>
              </thead>
              <tbody>
                <tr><td><img src={getImageByPieceType(PieceType.Wolf, 'w')} alt="" className="rule-icon"/> Wolf</td><td>Walk 3</td><td>1</td><td><strong>Pack Tactics:</strong> +1 STR per adjacent Wolf</td></tr>
                <tr><td><img src={getImageByPieceType(PieceType.Healer, 'w')} alt="" className="rule-icon"/> Healer</td><td>1 any</td><td>1</td><td><strong>Strength Aura:</strong> +1 STR to adjacent allies</td></tr>
                <tr><td><img src={getImageByPieceType(PieceType.Ranger, 'w')} alt="" className="rule-icon"/> Ranger</td><td>Walk 2</td><td>1</td><td>Long-Range attack (3 hexes)</td></tr>
                <tr><td><img src={getImageByPieceType(PieceType.Wizard, 'w')} alt="" className="rule-icon"/> Wizard</td><td>1 any</td><td>1</td><td><strong>Fireball:</strong> One-time area damage</td></tr>
                <tr><td><img src={getImageByPieceType(PieceType.Necromancer, 'w')} alt="" className="rule-icon"/> Necromancer</td><td>1 any</td><td>1</td><td><strong>Raise Dead:</strong> Revive captured piece</td></tr>
                <tr><td><img src={getImageByPieceType(PieceType.Phoenix, 'w')} alt="" className="rule-icon"/> Phoenix</td><td>Fly 3</td><td>2</td><td><strong>Rebirth:</strong> Returns 3 turns after death</td></tr>
              </tbody>
            </table>
          </section>

          {/* Standard Pieces */}
          <section id="pieces">
            <h2>♟️ Standard Pieces</h2>
            <table className="rules-table pieces-table">
              <thead>
                <tr>
                  <th>Piece</th>
                  <th>Movement</th>
                  <th>Attack</th>
                  <th>STR</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                    <td><img src={getImageByPieceType(PieceType.Swordsman, 'w')} alt="" className="rule-icon"/> Swordsman</td>
                    <td>1 forward</td><td>Diagonal</td><td>1</td><td>Like a pawn</td>
                </tr>
                <tr>
                    <td><img src={getImageByPieceType(PieceType.Archer, 'w')} alt="" className="rule-icon"/> Archer</td>
                    <td>1 any</td><td>Range 2</td><td>1</td><td>Basic ranged</td>
                </tr>
                <tr>
                    <td><img src={getImageByPieceType(PieceType.Knight, 'w')} alt="" className="rule-icon"/> Knight</td>
                    <td>∞ diagonal</td><td>Melee</td><td>1</td><td>Like a bishop</td>
                </tr>
                <tr>
                    <td><img src={getImageByPieceType(PieceType.Trebuchet, 'w')} alt="" className="rule-icon"/> Trebuchet</td>
                    <td>1 any</td><td>Range 3</td><td>1</td><td>Heavy</td>
                </tr>
                <tr>
                    <td><img src={getImageByPieceType(PieceType.Eagle, 'w')} alt="" className="rule-icon"/> Eagle</td>
                    <td>3 flying</td><td>Melee</td><td>1</td><td>Ignores obstacles</td>
                </tr>
                <tr>
                    <td><img src={getImageByPieceType(PieceType.Giant, 'w')} alt="" className="rule-icon"/> Giant</td>
                    <td>∞ orthogonal</td><td>Melee</td><td>2</td><td>Like a rook, Heavy</td>
                </tr>
                <tr>
                    <td><img src={getImageByPieceType(PieceType.Assassin, 'w')} alt="" className="rule-icon"/> Assassin</td>
                    <td>∞ any</td><td>Melee</td><td>1</td><td>Like a queen</td>
                </tr>
                <tr>
                    <td><img src={getImageByPieceType(PieceType.Dragon, 'w')} alt="" className="rule-icon"/> Dragon</td>
                    <td>L-shaped</td><td>Melee</td><td>3</td><td>Heavy, Flying</td>
                </tr>
                <tr>
                    <td><img src={getImageByPieceType(PieceType.Monarch, 'w')} alt="" className="rule-icon"/> Monarch</td>
                    <td>1 any</td><td>Melee</td><td>3</td><td>Heavy, Protect!</td>
                </tr>
              </tbody>
            </table>
          </section>

          {/* Combat */}
          <section id="combat">
            <h2>⚔️ Combat</h2>
            <div className="rules-box">
              <h4>Damage Calculation</h4>
              <p>Attacker deals damage equal to their <strong>Strength</strong>. Damage accumulates on the defender.</p>
              <p><em>Defender dies if: Total Accumulated Damage ≥ Their Max Strength</em></p>
              <p><small>(Note: Strength acts as both Attack Power and Max HP)</small></p>
            </div>
            
            <h4>🛡️ Ranged Protection</h4>
            <div className="rules-note">
              <p><strong>Defended Pieces:</strong> Any piece adjacent to a friendly unit is "Defended".</p>
              <p><strong>Benefit:</strong> Defended pieces CANNOT be targeted by Ranged (Archer) or Long-Ranged (Trebuchet/Ranger) attacks. They must be attacked in Melee.</p>
            </div>

            <h4>Special Interactions</h4>
            <ul>
              <li><strong>Combined Arms:</strong> Multiple units can attack a single target in one turn. Damage stacks.</li>
              <li><strong>Assassination:</strong> Assassins instantly kill Monarchs (ignoring HP).</li>
              <li><strong>High Ground:</strong> Ranged units gain +1 range when attacking from a hill (if implemented).</li>
            </ul>
          </section>

          {/* Sanctuaries */}
          <section id="sanctuaries">
            <h2>🌟 Sanctuaries</h2>
            <p>Sanctuaries allow you to pledge loyalty to powerful entities to receive special units.</p>
            
            <div className="rules-box">
                <h4>How to Pledge</h4>
                <ol>
                    <li>Move a piece onto the Sanctuary hex.</li>
                    <li>Ensure you meet the <strong>Strength Requirement</strong> (Sum of adjacent friendly pieces).</li>
                    <li>(Tier 3 only) Sacrifice an adjacent friendly unit.</li>
                    <li>Click the Sanctuary to summon the special unit!</li>
                </ol>
            </div>

            <h4>Sanctuary Types</h4>
            <table className="rules-table">
              <thead>
                <tr><th>Visual</th><th>Sanctuary</th><th>Summons</th><th>Tier</th></tr>
              </thead>
              <tbody>
                <tr>
                    <td className="hex-cell">
                        <svg viewBox="0 0 110 110" className="tile-visual-svg small">
                            <polygon points="55 5, 98 27.5, 98 72.5, 55 95, 12 72.5, 12 27.5" className="hexagon-sanctuary hexagon-sanctuary-wolf" />
                        </svg>
                    </td>
                    <td>Wolf Covenant</td>
                    <td><img src={getImageByPieceType(PieceType.Wolf, 'w')} alt="" className="rule-icon"/> Wolf</td>
                    <td>1</td>
                </tr>
                <tr>
                    <td className="hex-cell">
                        <svg viewBox="0 0 110 110" className="tile-visual-svg small">
                            <polygon points="55 5, 98 27.5, 98 72.5, 55 95, 12 72.5, 12 27.5" className="hexagon-sanctuary hexagon-sanctuary-healer" />
                        </svg>
                    </td>
                    <td>Sacred Spring</td>
                    <td><img src={getImageByPieceType(PieceType.Healer, 'w')} alt="" className="rule-icon"/> Healer</td>
                    <td>1</td>
                </tr>
                <tr>
                    <td className="hex-cell">
                        <svg viewBox="0 0 110 110" className="tile-visual-svg small">
                            <polygon points="55 5, 98 27.5, 98 72.5, 55 95, 12 72.5, 12 27.5" className="hexagon-sanctuary hexagon-sanctuary-ranger" />
                        </svg>
                    </td>
                    <td>Warden's Watch</td>
                    <td><img src={getImageByPieceType(PieceType.Ranger, 'w')} alt="" className="rule-icon"/> Ranger</td>
                    <td>2</td>
                </tr>
                <tr>
                    <td className="hex-cell">
                        <svg viewBox="0 0 110 110" className="tile-visual-svg small">
                            <polygon points="55 5, 98 27.5, 98 72.5, 55 95, 12 72.5, 12 27.5" className="hexagon-sanctuary hexagon-sanctuary-wizard" />
                        </svg>
                    </td>
                    <td>Arcane Refuge</td>
                    <td><img src={getImageByPieceType(PieceType.Wizard, 'w')} alt="" className="rule-icon"/> Wizard</td>
                    <td>2</td>
                </tr>
                <tr>
                    <td className="hex-cell">
                        <svg viewBox="0 0 110 110" className="tile-visual-svg small">
                            <polygon points="55 5, 98 27.5, 98 72.5, 55 95, 12 72.5, 12 27.5" className="hexagon-sanctuary hexagon-sanctuary-necromancer" />
                        </svg>
                    </td>
                    <td>Forsaken Grounds</td>
                    <td><img src={getImageByPieceType(PieceType.Necromancer, 'w')} alt="" className="rule-icon"/> Necromancer</td>
                    <td>3</td>
                </tr>
                <tr>
                    <td className="hex-cell">
                        <svg viewBox="0 0 110 110" className="tile-visual-svg small">
                            <polygon points="55 5, 98 27.5, 98 72.5, 55 95, 12 72.5, 12 27.5" className="hexagon-sanctuary hexagon-sanctuary-phoenix" />
                        </svg>
                    </td>
                    <td>Pyre Eternal</td>
                    <td><img src={getImageByPieceType(PieceType.Phoenix, 'w')} alt="" className="rule-icon"/> Phoenix</td>
                    <td>3</td>
                </tr>
              </tbody>
            </table>
          </section>

          {/* Victory */}
          <section id="victory">
            <h2>🏆 Victory Conditions</h2>
            <div className="victory-cards">
              <div className="victory-card">
                <h4>👑 Monarch Capture</h4>
                <p>Capture all opponent Monarchs</p>
              </div>
              <div className="victory-card">
                <h4>🏰 Castle Control</h4>
                <p>Control all 6 castles</p>
              </div>
            </div>
          </section>

          <div className="rules-footer">
            <em>Good luck, commander! 🎯</em>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RulesModal;
