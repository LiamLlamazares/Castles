import React, { useEffect, useRef } from "react";
import { MoveRecord, Color } from "../Constants";

interface HistoryTableProps {
  moveHistory: MoveRecord[];
  currentPlayer: Color;
}

const HistoryTable: React.FC<HistoryTableProps> = ({ moveHistory }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when history updates
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [moveHistory]);

  // Group moves by turn number
  const turns: { [key: number]: { white?: string; black?: string } } = {};
  
  moveHistory.forEach((record) => {
    if (!turns[record.turnNumber]) {
      turns[record.turnNumber] = {};
    }
    // Append move to the correct color slot. 
    // If multiple moves per turn (e.g. recruit + move), append with comma?
    // User wants "moves of each player placed side by side".
    // Let's stack them or comma separate inside the cell.
    if (record.color === "w") {
        const current = turns[record.turnNumber].white;
        turns[record.turnNumber].white = current ? `${current}, ${record.notation}` : record.notation;
    } else {
        const current = turns[record.turnNumber].black;
        turns[record.turnNumber].black = current ? `${current}, ${record.notation}` : record.notation;
    }
  });

  const turnNumbers = Object.keys(turns).map(Number).sort((a, b) => a - b);

  return (
    <div className="history-table-container" style={{ 
        flex: 1, 
        overflowY: "auto", 
        background: "rgba(0,0,0,0.2)", 
        borderRadius: "4px",
        marginTop: "10px",
        padding: "5px"
    }} ref={scrollRef}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9em" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.3)", textAlign: "left" }}>
            <th style={{ padding: "4px", width: "15%" }}>#</th>
            <th style={{ padding: "4px", width: "42%" }}>White</th>
            <th style={{ padding: "4px", width: "43%" }}>Black</th>
          </tr>
        </thead>
        <tbody>
          {turnNumbers.map((num) => (
            <tr key={num} style={{ borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
              <td style={{ padding: "4px", opacity: 0.7 }}>{num}.</td>
              <td style={{ padding: "4px", color: "#eee" }}>{turns[num].white || ""}</td>
              <td style={{ padding: "4px", color: "#aaa" }}>{turns[num].black || ""}</td>
            </tr>
          ))}
          {turnNumbers.length === 0 && (
            <tr>
              <td colSpan={3} style={{ padding: "10px", textAlign: "center", opacity: 0.5 }}>
                No moves yet
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};

export default HistoryTable;
