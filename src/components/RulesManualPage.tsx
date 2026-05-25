import React from "react";
import "../css/RulesManualPage.css";
import { getImageByPieceType } from "./PieceImages";
import { useTheme } from "../contexts/ThemeContext";
import { PieceType } from "../Constants";
import {
  abilityReferenceRows,
  allPieceReferenceRows,
  castleRules,
  combatRules,
  combatExampleRules,
  commonBlockerRules,
  optionalModeRules,
  phaseRules,
  promotionRules,
  rangeDetailRules,
  recruitmentCycle,
  recruitmentDetailRules,
  movementRules,
  sanctuaryReferenceRows,
  sanctuaryDetailRules,
  sanctuaryRules,
  setupRules,
  specialAbilityRules,
  specialPieceReferenceRows,
  standardPieceReferenceRows,
  terrainRules,
  winningRules,
} from "../rules/rulesContent";

const terrainHexClasses: Record<string, string> = {
  River: "rules-terrain-river",
  Castle: "rules-terrain-castle",
  "High ground": "rules-terrain-high-ground",
  Sanctuary: "rules-terrain-sanctuary",
};

const RuleList: React.FC<{ rules: { title: string; text: string }[]; variant?: "default" | "terrain" }> = ({
  rules,
  variant = "default",
}) => (
  <div className={`rules-manual-card-grid ${variant === "terrain" ? "rules-manual-terrain-grid" : ""}`}>
    {rules.map((rule) => (
      <article className="rules-manual-card" key={rule.title}>
        {variant === "terrain" && (
          <svg viewBox="0 0 110 110" className="rules-manual-terrain-hex">
            <polygon
              points="55 5, 98 27.5, 98 72.5, 55 95, 12 72.5, 12 27.5"
              className={terrainHexClasses[rule.title] || "hexagon"}
            />
            {rule.title === "Sanctuary" && (
              <image
                href={getImageByPieceType(PieceType.Wolf, "w")}
                x="34"
                y="34"
                width="42"
                height="42"
              />
            )}
          </svg>
        )}
        <h3>{rule.title}</h3>
        <p>{rule.text}</p>
      </article>
    ))}
  </div>
);

const PieceTable: React.FC<{ title: string; rows: typeof allPieceReferenceRows }> = ({ title, rows }) => (
  <>
    <h3>{title}</h3>
    <table className="rules-manual-table">
      <thead>
        <tr>
          <th>Piece</th>
          <th>Strength</th>
          <th>Attack</th>
          <th>Rule</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((piece) => (
          <tr key={piece.type}>
            <td><img src={getImageByPieceType(piece.type, "w")} alt="" className="rules-manual-piece-icon" />{piece.name}</td>
            <td>{piece.strength}</td>
            <td>{piece.attackType}</td>
            <td>{piece.description}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </>
);

const RulesManualPage: React.FC = () => {
  const { isDark, toggleTheme } = useTheme();

  return (
    <main className="rules-manual-page">
      <header className="rules-manual-hero">
        <p className="rules-manual-kicker">Castles Reference</p>
        <h1>Full Rules Manual</h1>
        <p>
          A structured reference for the current rules. The quick in-game rules stay short; this page can grow with
          diagrams, examples, and edge cases.
        </p>
        <div className="rules-manual-hero-actions">
          <a className="rules-manual-back-link" href="/">Back to game</a>
          <button className="rules-manual-theme-button" onClick={toggleTheme}>
            {isDark ? "Light mode" : "Dark mode"}
          </button>
        </div>
      </header>

      <nav className="rules-manual-nav" aria-label="Rules sections">
        <a href="#quick-start">Quick Start</a>
        <a href="#setup">Setup</a>
        <a href="#winning">Winning</a>
        <a href="#turn-phases">Turn Phases</a>
        <a href="#terrain">Terrain</a>
        <a href="#movement">Movement</a>
        <a href="#combat">Combat</a>
        <a href="#combat-examples">Combat Examples</a>
        <a href="#ranges">Ranges</a>
        <a href="#castles">Castles and Recruitment</a>
        <a href="#recruitment-cycle">Recruitment Cycle</a>
        <a href="#promotion">Promotion</a>
        <a href="#sanctuaries">Sanctuaries</a>
        <a href="#sanctuary-details">Sanctuary Details</a>
        <a href="#special-abilities">Special Abilities</a>
        <a href="#standard-pieces">Standard Pieces</a>
        <a href="#special-pieces">Special Pieces</a>
        <a href="#common-blockers">Common Blockers</a>
        <a href="#optional-modes">Optional Modes</a>
      </nav>

      <section id="quick-start">
        <h2>Quick Start</h2>
        <p>
          Win by eliminating every enemy Monarch or controlling every castle. Each player turn has two Movement
          slots, two Attack slots, then one Castles phase.
        </p>
      </section>

      <section id="setup">
        <h2>Setup and Board</h2>
        <RuleList rules={setupRules} />
      </section>

      <section id="winning">
        <h2>Winning</h2>
        <RuleList rules={winningRules} />
      </section>

      <section id="turn-phases">
        <h2>Turn Phases</h2>
        <RuleList rules={phaseRules} />
      </section>

      <section id="terrain">
        <h2>Terrain</h2>
        <RuleList rules={terrainRules} variant="terrain" />
      </section>

      <section id="movement">
        <h2>Movement</h2>
        <RuleList rules={movementRules} />
      </section>

      <section id="combat">
        <h2>Combat</h2>
        <RuleList rules={combatRules} />
      </section>

      <section id="combat-examples">
        <h2>Combat Examples</h2>
        <RuleList rules={combatExampleRules} />
      </section>

      <section id="ranges">
        <h2>Ranges</h2>
        <p>
          Ranged attacks use exact distances. A target can be too close as well as too far.
        </p>
        <RuleList rules={rangeDetailRules} />
      </section>

      <section id="castles">
        <h2>Castles and Recruitment</h2>
        <RuleList rules={castleRules} />
      </section>

      <section id="recruitment-cycle">
        <h2>Recruitment Cycle</h2>
        <RuleList rules={recruitmentDetailRules} />
        <ol className="rules-manual-cycle" aria-label="Recruitment cycle order">
          {recruitmentCycle.map((pieceType) => (
            <li key={pieceType}>
              <span className="rules-manual-cycle-index">{recruitmentCycle.indexOf(pieceType) + 1}</span>
              <img src={getImageByPieceType(pieceType, "w")} alt="" className="rules-manual-cycle-icon" />
              <span>{pieceType}</span>
            </li>
          ))}
        </ol>
      </section>

      <section id="promotion">
        <h2>Promotion</h2>
        <RuleList rules={promotionRules} />
      </section>

      <section id="sanctuaries">
        <h2>Sanctuaries</h2>
        <RuleList rules={sanctuaryRules} />
        <h3>Sanctuary Types</h3>
        <table className="rules-manual-table">
          <thead>
            <tr>
              <th>Sanctuary</th>
              <th>Summons</th>
              <th>Tier</th>
              <th>Requirement</th>
            </tr>
          </thead>
          <tbody>
            {sanctuaryReferenceRows.map((sanctuary) => (
              <tr key={sanctuary.type}>
                <td>{sanctuary.name}</td>
                <td><img src={getImageByPieceType(sanctuary.summons, "w")} alt="" className="rules-manual-piece-icon" />{sanctuary.summons}</td>
                <td>{sanctuary.tier}</td>
                <td>{sanctuary.requirement}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section id="sanctuary-details">
        <h2>Sanctuary Details</h2>
        <RuleList rules={sanctuaryDetailRules} />
      </section>

      <section id="special-abilities">
        <h2>Special Abilities</h2>
        <RuleList rules={specialAbilityRules} />
        <h3>Ability Reference</h3>
        <table className="rules-manual-table">
          <thead>
            <tr>
              <th>Ability</th>
              <th>Timing</th>
              <th>Range</th>
              <th>Rule</th>
            </tr>
          </thead>
          <tbody>
            {abilityReferenceRows.map((ability) => (
              <tr key={ability.type}>
                <td>{ability.name}</td>
                <td>{ability.timing}</td>
                <td>{ability.range}</td>
                <td>{ability.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section id="standard-pieces">
        <h2>Standard Pieces</h2>
        <PieceTable title="Standard piece reference" rows={standardPieceReferenceRows} />
      </section>

      <section id="special-pieces">
        <h2>Special Pieces</h2>
        <PieceTable title="Sanctuary piece reference" rows={specialPieceReferenceRows} />
      </section>

      <section id="common-blockers">
        <h2>Common Blockers</h2>
        <p>
          If the interface refuses an action, these are the usual rule reasons to check first.
        </p>
        <RuleList rules={commonBlockerRules} />
      </section>

      <section id="optional-modes">
        <h2>Optional Modes</h2>
        <RuleList rules={optionalModeRules} />
      </section>
    </main>
  );
};

export default RulesManualPage;
