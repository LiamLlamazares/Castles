import React, { useEffect, useRef } from "react";
import { MoveRecord, Color } from "../Constants";
import { MoveTree, MoveNode } from "../Classes/Core/MoveTree";

interface HistoryTableProps {
  moveHistory: MoveRecord[];
  moveTree?: MoveTree;
  onJumpToNode?: (id: string) => void;
  currentPlayer: Color;
}

const HistoryTable: React.FC<HistoryTableProps> = ({ moveHistory, moveTree, onJumpToNode }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when history updates
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [moveHistory, moveTree]);

  if (!moveTree) return <div className="history-table-container">No history</div>;

  const currentId = moveTree.current.id;

  const renderMoves = (nodes: MoveNode[], depth: number = 0): React.ReactNode => {
    if (nodes.length === 0) return null;

    const elements: React.ReactNode[] = [];
    
    // Main line for this variation
    for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        const isSelected = node.id === currentId;
        
        // Render move number if it's white's move OR if it's the start of a variation
        const shouldShowNumber = node.move.color === 'w' || i === 0;
        
        elements.push(
            <span 
                key={node.id}
                onClick={() => onJumpToNode?.(node.id)}
                className="history-move"
                style={{
                    cursor: "pointer",
                    padding: "2px 4px",
                    borderRadius: "3px",
                    background: isSelected ? "rgba(255, 255, 255, 0.2)" : "transparent",
                    color: isSelected ? "#fff" : node.move.color === 'w' ? "#ccc" : "#999",
                    fontWeight: isSelected ? "bold" : "normal",
                    display: "inline-block",
                    marginRight: "4px"
                }}
            >
                {shouldShowNumber && <span style={{ opacity: 0.5, marginRight: "4px" }}>{node.move.turnNumber}.</span>}
                {node.move.notation}
            </span>
        );

        // Check for side variations (children other than the selected one)
        if (node.children.length > 1) {
            const variations = node.children.filter((_, idx) => idx !== node.selectedChildIndex);
            variations.forEach((vNode, vIdx) => {
                elements.push(
                    <div 
                        key={`${vNode.id}-var-${vIdx}`}
                        className="variation-block"
                        style={{
                            fontSize: "0.9em",
                            color: "#888",
                            background: "rgba(0,0,0,0.15)",
                            padding: "4px 8px",
                            margin: "4px 0",
                            borderRadius: "4px",
                            borderLeft: "2px solid rgba(255,255,255,0.1)"
                        }}
                    >
                        <span style={{ fontStyle: "italic", marginRight: "4px" }}>(variation) </span>
                        {renderMoveChain(vNode)}
                    </div>
                );
            });
        }
    }

    return elements;
  };

  const renderMoveChain = (startNode: MoveNode): React.ReactNode => {
      const chain: MoveNode[] = [];
      let curr: MoveNode | null = startNode;
      while (curr) {
          chain.push(curr);
          // In a variation "chain", we just follow the selected path of that branch
          curr = curr.children[curr.selectedChildIndex] || null;
      }
      return renderMoves(chain);
  };

  // The move history displayed in the UI is traditionally the "main line" or the "current branch"
  // We'll start from the root's first child
  const rootMoves: MoveNode[] = [];
  let currentInMain: MoveNode | null = moveTree.rootNode.children[moveTree.rootNode.selectedChildIndex] || null;
  while(currentInMain) {
      rootMoves.push(currentInMain);
      currentInMain = currentInMain.children[currentInMain.selectedChildIndex] || null;
  }

  return (
    <div className="history-table-container" style={{ 
        flex: 1, 
        overflowY: "auto", 
        background: "rgba(0,0,0,0.3)", 
        backdropFilter: "blur(4px)",
        borderRadius: "8px",
        marginTop: "12px",
        padding: "12px",
        fontFamily: "'Inter', 'Roboto Mono', monospace",
        fontSize: "0.85rem",
        lineHeight: "1.8",
        border: "1px solid rgba(255,255,255,0.1)",
        boxShadow: "inset 0 2px 4px rgba(0,0,0,0.3)"
    }} ref={scrollRef}>
      {rootMoves.length > 0 ? (
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline" }}>
            {renderMoves(rootMoves)}
          </div>
      ) : (
          <div style={{ textAlign: "center", opacity: 0.5, padding: "20px" }}>No moves yet</div>
      )}
      
      <style>{`
        .history-move:hover {
            background: rgba(255,255,255,0.1) !important;
            color: #fff !important;
        }
        .variation-block {
            width: 100%;
            margin: 6px 0;
            position: relative;
        }
        .variation-block::before {
            content: '';
            position: absolute;
            left: -8px;
            top: 0;
            bottom: 0;
            width: 2px;
            background: rgba(255,255,255,0.15);
            border-radius: 2px;
        }
      `}</style>
    </div>
  );
};

export default HistoryTable;
