import React, { useEffect, useRef } from "react";
import { MoveRecord, Color } from "../Constants";
import { MoveTree, MoveNode } from "../Classes/Core/MoveTree";

interface HistoryTableProps {
  moveHistory: MoveRecord[];
  moveTree?: MoveTree;
  onJumpToNode?: (id: string) => void;
  currentPlayer: Color;
  viewMoveIndex?: number | null; // When viewing history, which move index is selected
}

const HistoryTable: React.FC<HistoryTableProps> = ({ moveHistory, moveTree, onJumpToNode, viewMoveIndex }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when history updates
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [moveHistory, moveTree]);

  if (!moveTree) return <div className="history-table-container">No history</div>;

  // Determine which node is "current" for highlighting
  // If viewMoveIndex is set, find the node at that index; otherwise use moveTree.current
  // Note: history[N] is the snapshot AFTER move N+1 (0-indexed)
  // So viewMoveIndex 0 = state after move 1, highlight move 1
  // viewMoveIndex 2 = state after move 3, highlight move 3
  let highlightedId = moveTree.current.id;
  if (viewMoveIndex !== null && viewMoveIndex !== undefined && viewMoveIndex >= 0) {
    // Walk from root to find the node: traverse viewMoveIndex+1 steps to get move at that index
    let currentNode = moveTree.rootNode;
    const stepsToTake = viewMoveIndex + 1; // history index 0 = 1 step to first move node
    for (let i = 0; i < stepsToTake && currentNode.children.length > 0; i++) {
      currentNode = currentNode.children[currentNode.selectedChildIndex] || currentNode.children[0];
    }
    highlightedId = currentNode.id;
  }

  const renderMoves = (nodes: MoveNode[], depth: number = 0): React.ReactNode => {
    if (nodes.length === 0) return null;

    const elements: React.ReactNode[] = [];
    
    // Main line for this variation
    for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        const isSelected = node.id === highlightedId;
        
        // Render move number if it's white's move OR if it's the start of a variation
        const shouldShowNumber = node.move.color === 'w' || i === 0;
        
        elements.push(
            <span 
                key={node.id}
                onClick={() => onJumpToNode?.(node.id)}
                className={`history-move ${isSelected ? 'selected' : ''}`}
                style={{
                    cursor: "pointer",
                    padding: "3px 8px",
                    borderRadius: "4px",
                    background: isSelected ? "#fff" : "rgba(255, 255, 255, 0.9)",
                    color: "#000",
                    fontWeight: isSelected ? "800" : "500",
                    display: "inline-flex",
                    alignItems: "center",
                    marginRight: "6px",
                    marginBottom: "6px",
                    boxShadow: isSelected ? "0 0 0 2px #4a90e2, 0 4px 6px rgba(0,0,0,0.3)" : "0 2px 4px rgba(0,0,0,0.2)",
                    fontSize: "0.8rem",
                    transition: "all 0.2s ease"
                }}
            >
                {shouldShowNumber && <span style={{ opacity: 0.6, marginRight: "4px", fontWeight: "bold" }}>{node.move.turnNumber}.</span>}
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
                            fontSize: "0.85em",
                            color: "#ccc",
                            background: "rgba(255,255,255,0.05)",
                            padding: "6px 10px",
                            margin: "8px 0",
                            borderRadius: "6px",
                            borderLeft: "3px solid #4a90e2",
                            width: "100%"
                        }}
                    >
                        <span style={{ fontStyle: "italic", marginRight: "6px", opacity: 0.7, fontSize: "0.8em" }}>VARIANT: </span>
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
            transform: translateY(-1px);
            box-shadow: 0 4px 8px rgba(0,0,0,0.4) !important;
            background: #fff !important;
            filter: brightness(1.1);
        }
        .history-move.selected {
            border: 1px solid #4a90e2;
            z-index: 2;
        }
        .variation-block {
            position: relative;
            box-shadow: inset 0 0 10px rgba(0,0,0,0.2);
        }
        .variation-block::before {
            content: '';
            position: absolute;
            left: 0;
            top: 4px;
            bottom: 4px;
            width: 3px;
            background: #4a90e2;
            border-radius: 4px;
        }
      `}</style>
    </div>
  );
};

export default HistoryTable;
