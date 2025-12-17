import { MoveTree, MoveNode } from "../Core/MoveTree";
import { MoveRecord, Color, TurnPhase } from "../../Constants";

export class PGNParser {
    
    /**
     * Parses a PGN move string into a MoveTree.
     * Handles Recursive Annotation Variations (RAV) enclosed in parenthesis.
     */
    public static parseToTree(pgnBody: string): MoveTree {
        const tree = new MoveTree();
        const tokens = this.tokenize(pgnBody);
        
        this.parseSequence(tokens, tree);
        
        return tree;
    }

    private static tokenize(pgn: string): string[] {
        // Add spaces around parentheses to transform ( -> ( 
        // Remove comments { ... }
        // Split by whitespace
        const clean = pgn.replace(/\{[^}]*\}/g, "") // Remove comments
                         .replace(/\(/g, " ( ")
                         .replace(/\)/g, " ) ")
                         .replace(/(\d+)\.(?!\.)/g, "$1. "); // Ensure "1." is separated, but ignore "1..."
        
        return clean.split(/\s+/).filter(t => t.trim() !== "");
    }

    private static parseSequence(tokens: string[], tree: MoveTree): void {
        let activeColor: 'w' | 'b' = 'w'; // Track color for metadata (approximate)
        let turnNumber = 1;

        while (tokens.length > 0) {
            const token = tokens[0]; // Peek

            if (token === ")") {
                return; // End of variation, return to parent caller
            }

            if (token === "(") {
                tokens.shift(); // Consume "("
                // Start a variation
                // We need to navigate BACK to the parent of the current node to branch off
                // BUT `MoveTree` structure implies branching from `currentNode`.
                // In PGN, ( starts immediately after the move it is a variation OF?
                // No, RAV usually follows the move. "1. e4 ( 1. d4 )" means d4 is alt to e4.
                // Standard PGN: "1. e4 (1. d4)" -> d4 branches from START position.
                // "1. e4 e5 (1... c5)" -> c5 branches from position AFTER e4.
                
                // So, before parsing the variation, we must be at the node *before* the variation starts.
                // The current node in `tree` is the last move played.
                // If we see a variation now, it is an alternative to the *current* move?
                // No, usually PGN is: Move A (Variation B). B is alternative to A.
                // So we must step back once, start variation, then when done, step forward again?
                // Wait. "1. e4 e5" -> Tree: Start -> e4 -> e5.
                // "1. e4 e5 (1... c5)"
                // We parsed e5. Current node is e5.
                // We encounter (. this variation is for 1... c5.
                // It is an alternative to e5.
                // So the parent is e4.
                // We need to move `tree.current` to e4 (parent of e5).
                
                const returnNode = tree.current;
                
                if (returnNode.parent) {
                     tree.navigateBack(); // Go to parent to start variation
                     this.parseSequence(tokens, tree); // Parse the variation
                     
                     // Restore position to where we were before variation
                     tree.setCurrentNode(returnNode);
                } else {
                     console.warn("Variation at root - ignoring");
                     // Consume variation tokens to avoid infinite loop?
                     // Or just parse it as if it's main line?
                     // If we don't consume, parseSequence will run until )
                     this.parseSequence(tokens, tree);
                }
                
                // Ensure we consumed the closing parenthesis
                if (tokens[0] === ")") {
                    tokens.shift();
                }
            } else {
                 tokens.shift(); // Consume token
                 
                 // Skip move numbers "1." or "1..."
                 if (/^\d+(\.{1,3})?$/.test(token)) {
                     // Try to parse turn number
                     const num = parseInt(token);
                     if (!isNaN(num)) turnNumber = num;
                     continue;
                 }
                 
                 // Skip results
                 if (['1-0', '0-1', '1/2-1/2', '*'].includes(token)) continue;

                 // It's a move notation!
                 // We don't have full context for `turnNumber` and `phase` without simulation,
                 // but we can approximate or fill with defaults. `loadPGN` logic might re-fill this?
                 // Actually `MoveRecord` in `MoveNode` needs to be accurate-ish.
                 // We can infer `color` from turn number if we assume standard ordering...
                 // But simply: just Add Move.
                 
                 const moveRecord: MoveRecord = {
                     notation: token,
                     turnNumber: turnNumber, // Approximate
                     color: 'w', // Placeholder, corrected by replay?
                     phase: 'Movement' // Placeholder
                 };
                 
                 tree.addMove(moveRecord);
            }
        }
    }
}
