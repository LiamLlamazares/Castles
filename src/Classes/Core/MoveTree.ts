import { MoveRecord, HistoryEntry } from "../../Constants";


export interface MoveNode {
    id: string; // Unique ID for node
    move: MoveRecord;
    parent: MoveNode | null;
    children: MoveNode[];
    selectedChildIndex: number; // For "main line" navigation
    
    // For stable re-navigation / state reconstruction
    snapshot?: HistoryEntry; 
    
    // Annotations or comments could go here
    comment?: string;
}

/**
 * Manages a tree of moves (variations).
 * 
 * Structure:
 * - Root node is usually null or a placeholder for "Start of Game".
 * - Moves are added as children.
 * - If a move is added to a node that already has children, it creates a new variation (branch).
 */
export class MoveTree {
    private root: MoveNode;
    private currentNode: MoveNode;

    constructor() {
        this.root = this.createNode({ 
            notation: "Start", 
            turnNumber: 0, 
            color: 'w' as any, 
            phase: 'Movement' as any 
        }, null);
        this.currentNode = this.root;
    }

    private createNode(move: MoveRecord, parent: MoveNode | null, snapshot?: HistoryEntry): MoveNode {
        return {
            id: Math.random().toString(36).substr(2, 9),
            move,
            parent,
            children: [],
            selectedChildIndex: 0,
            snapshot
        };
    }

    public get current(): MoveNode {
        return this.currentNode;
    }

    public get rootNode(): MoveNode {
        return this.root;
    }

    /**
     * Adds a move to the current node.
     * If the move already exists as a child (same notation), navigates to it.
     * If other children exist but not this one, adds it as a new variation.
     */
    public addMove(move: MoveRecord, snapshot?: HistoryEntry): void {
        const existingChildIndex = this.currentNode.children.findIndex(
            child => child.move.notation === move.notation
        );

        if (existingChildIndex >= 0) {
            // Move already exists, just navigate to it
            // Optionally promote it to main line? For now, just select it.
            this.currentNode.selectedChildIndex = existingChildIndex;
            this.currentNode = this.currentNode.children[existingChildIndex];
            
            // Update snapshot if provided and missing (e.g. from PGN import)
            if (snapshot && !this.currentNode.snapshot) {
                this.currentNode.snapshot = snapshot;
            }
        } else {
            // Create new child
            const newNode = this.createNode(move, this.currentNode, snapshot);
            this.currentNode.children.push(newNode);
            this.currentNode.selectedChildIndex = this.currentNode.children.length - 1; // Select the new move
            this.currentNode = newNode;
        }
    }

    public findNodeById(id: string, startNode: MoveNode = this.root): MoveNode | null {
        if (startNode.id === id) return startNode;
        for (const child of startNode.children) {
            const found = this.findNodeById(id, child);
            if (found) return found;
        }
        return null;
    }

    public navigateBack(): boolean {
        if (this.currentNode.parent) {
            this.currentNode = this.currentNode.parent;
            return true;
        }
        return false;
    }

    public navigateForward(): boolean {
        if (this.currentNode.children.length > 0) {
            const index = this.currentNode.selectedChildIndex;
            if (this.currentNode.children[index]) {
                this.currentNode = this.currentNode.children[index];
                return true;
            }
        }
        return false;
    }

    public goToRoot(): void {
        this.currentNode = this.root;
    }

    public setCurrentNode(node: MoveNode): void {
        this.currentNode = node;
    }

    /**
     * Navigates to a specific move index in the current line.
     * Index 0 = First Move.
     * Index -1 = Root.
     */
    public navigateToIndex(index: number): void {
        const history = this.getHistoryLine();
        // history[0] is first move.
        // If index is 0, we want node for history[0].
        
        // Optimization: if we just want to sync with linear list
        if (index < -1) return;
        if (index >= history.length) index = history.length - 1;
        
        // We can't easily jump random access unless we have the node references or re-traverse.
        // Since we have the history line nodes? No getHistoryLine returns records.
        // We need to traverse from root?
        // Or traverse back/forward from current.
        
        // Simple inefficient approach: Go Root, then forward 'index + 1' times?
        // But forward() is ambiguous if multiple children.
        // We assume we want the "selected" path if we are just syncing?
        // BUT, `useAnalysisMode` is linear history of *snapshots*. 
        // The snapshots correspond to the `moveHistory` list.
        // So we can assume the `moveTree` current line matches the `history` snapshots.
        
        // Better: Find the ancestors of the current node.
        // The `currentNode` represents the LAST move made (index = length - 1).
        
        let path: MoveNode[] = [];
        let curr: MoveNode | null = this.currentNode;
        while(curr && curr !== this.root) {
            path.unshift(curr);
            curr = curr.parent;
        }
        // path is [Move 0, Move 1, ... Move N]
        
        // We want to go to index.
        if (index === -1) {
            this.currentNode = this.root;
            return;
        }
        
        if (index < path.length) {
            this.currentNode = path[index];
        } else {
            // Warning: index out of bounds of current line
            console.warn(`MoveTree: Index ${index} out of bounds (length ${path.length})`);
        }
    }

    /**
     * Gets the full history (MoveRecord[]) from root to current node.
     * Used for recreating Board state.
     */
    public getHistoryLine(): MoveRecord[] {
        const history: MoveRecord[] = [];
        let node: MoveNode | null = this.currentNode;
        while (node && node !== this.root) {
            history.unshift(node.move);
            node = node.parent;
        }
        return history;
    }
    
    /**
     * EXPERIMENTAL: Returns specific variation line.
     */
}
