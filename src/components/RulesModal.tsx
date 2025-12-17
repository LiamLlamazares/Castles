import React, { useEffect } from "react";
import "../css/RulesModal.css";

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
            <h2>🎮 Game Overview</h2>
            <h3>The Board</h3>
            <ul>
              <li>Hexagonal grid with sides of length 8</li>
              <li><strong>River hexes</strong> divide the board (impassable except for flying units)</li>
              <li><strong>6 Castles</strong> in corners (3 per player)</li>
              <li><strong>6 Sanctuaries</strong> for summoning special pieces</li>
            </ul>
            <h3>Starting Pieces</h3>
            <table className="rules-table">
              <tbody>
                <tr><td>Monarch ×1</td><td>Giants ×2</td></tr>
                <tr><td>Dragon ×1</td><td>Eagles ×2</td></tr>
                <tr><td>Assassin ×1</td><td>Trebuchets ×2</td></tr>
                <tr><td>Knights ×4</td><td>Archers ×6</td></tr>
                <tr><td>Swordsmen ×13</td><td></td></tr>
              </tbody>
            </table>
          </section>

          {/* Turn Phases */}
          <section id="turn-phases">
            <h2>🔄 Turn Phases</h2>
            <div className="phase-cards">
              <div className="phase-card">
                <h4>1. Movement 🥾</h4>
                <p>Move <strong>up to 2 pieces</strong><br/>(or 1 heavy unit)</p>
                <small>Heavy: Monarch, Dragon, Giant, Trebuchet</small>
              </div>
              <div className="phase-card">
                <h4>2. Attack ⚔️</h4>
                <p>Attack with <strong>up to 2 pieces</strong></p>
                <small>Multiple pieces can combine attacks</small>
              </div>
              <div className="phase-card">
                <h4>3. Castles 🏰</h4>
                <p>Recruit <strong>1 piece per castle</strong></p>
                <small>Order: Swordsman → Archer → Knight → ...</small>
              </div>
            </div>
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
                <tr><td>Swordsman</td><td>1 forward</td><td>Diagonal</td><td>1</td><td>Like a pawn</td></tr>
                <tr><td>Archer</td><td>1 any</td><td>Range 2</td><td>1</td><td>Basic ranged</td></tr>
                <tr><td>Knight</td><td>∞ diagonal</td><td>Melee</td><td>1</td><td>Like a bishop</td></tr>
                <tr><td>Trebuchet</td><td>1 any</td><td>Range 3</td><td>1</td><td>Heavy</td></tr>
                <tr><td>Eagle</td><td>3 flying</td><td>Melee</td><td>1</td><td>Ignores obstacles</td></tr>
                <tr><td>Giant</td><td>∞ orthogonal</td><td>Melee</td><td>2</td><td>Like a rook, Heavy</td></tr>
                <tr><td>Assassin</td><td>∞ any</td><td>Melee</td><td>1</td><td>Like a queen</td></tr>
                <tr><td>Dragon</td><td>L-shaped</td><td>Melee</td><td>3</td><td>Heavy, Flying</td></tr>
                <tr><td>Monarch</td><td>1 any</td><td>Melee</td><td>3</td><td>Heavy, Protect!</td></tr>
              </tbody>
            </table>
          </section>

          {/* Combat */}
          <section id="combat">
            <h2>⚔️ Combat</h2>
            <div className="rules-box">
              <h4>Damage Resolution</h4>
              <ol>
                <li>Attacker deals damage = their <strong>strength</strong></li>
                <li>Damage accumulates on defender</li>
                <li>Defender dies when damage ≥ strength</li>
                <li>All damage resets each round</li>
              </ol>
            </div>
            <h4>Special Rules</h4>
            <ul>
              <li><strong>Combining Attacks:</strong> Multiple pieces can attack one target (damage stacks)</li>
              <li><strong>Assassin:</strong> Instantly kills any Monarch</li>
              <li><strong>Coronation:</strong> Swordsman reaching back row promotes to any piece</li>
            </ul>
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
                <tr><td>Wolf</td><td>Walk 3</td><td>1</td><td><strong>Pack Tactics:</strong> +1 STR per adjacent Wolf</td></tr>
                <tr><td>Healer</td><td>1 any</td><td>1</td><td><strong>Heal:</strong> Remove damage from adjacent ally</td></tr>
                <tr><td>Ranger</td><td>Walk 2</td><td>1</td><td>Long-Range attack (3 hexes)</td></tr>
                <tr><td>Wizard</td><td>1 any</td><td>1</td><td><strong>Fireball:</strong> One-time area damage</td></tr>
                <tr><td>Necromancer</td><td>1 any</td><td>1</td><td><strong>Raise Dead:</strong> Revive captured piece</td></tr>
                <tr><td>Phoenix</td><td>Fly 3</td><td>2</td><td><strong>Rebirth:</strong> Returns 3 turns after death</td></tr>
              </tbody>
            </table>
          </section>

          {/* Sanctuaries */}
          <section id="sanctuaries">
            <h2>🌟 Sanctuaries</h2>
            <p>Special hexes for summoning powerful creatures.</p>
            <h4>Tiers</h4>
            <table className="rules-table">
              <thead>
                <tr><th>Tier</th><th>Requirement</th><th>Location</th></tr>
              </thead>
              <tbody>
                <tr><td>1</td><td>Occupy (STR ≥ 1)</td><td>Near river</td></tr>
                <tr><td>2</td><td>STR ≥ 3</td><td>Opponent's territory</td></tr>
                <tr><td>3</td><td>STR ≥ 4 + sacrifice</td><td>Deep enemy territory</td></tr>
              </tbody>
            </table>
            <h4>Sanctuary Types</h4>
            <table className="rules-table">
              <thead>
                <tr><th>Sanctuary</th><th>Summons</th><th>Tier</th></tr>
              </thead>
              <tbody>
                <tr><td>Wolf Covenant</td><td>Wolf</td><td>1</td></tr>
                <tr><td>Sacred Spring</td><td>Healer</td><td>1</td></tr>
                <tr><td>Warden's Watch</td><td>Ranger</td><td>2</td></tr>
                <tr><td>Arcane Refuge</td><td>Wizard</td><td>2</td></tr>
                <tr><td>Forsaken Grounds</td><td>Necromancer</td><td>3</td></tr>
                <tr><td>Pyre Eternal</td><td>Phoenix</td><td>3</td></tr>
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
