import { MoveRecord } from "../../Constants";
import { PositionSnapshot } from "./GameState";


export interface MoveNode {
    id: string; // Unique ID for node
    move: MoveRecord;
    parent: MoveNode | null;
    children: MoveNode[];
    selectedChildIndex: number; // For "main line" navigation
    
    // For stable re-navigation / state reconstruction
    snapshot?: PositionSnapshot; 
    
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
    private _root: MoveNode;
    private _currentNode: MoveNode;

    private createNode(move: MoveRecord, parent: MoveNode | null, snapshot?: PositionSnapshot): MoveNode {
        return {
            id: Math.random().toString(36).substr(2, 9),
            move,
            parent,
            children: [],
            selectedChildIndex: 0,
            snapshot
        };
    }

    constructor() {
        this._root = this.createNode({ 
            notation: "Start", 
            turnNumber: 0, 
            color: 'w' as any, 
            phase: 'Movement' as any 
        }, null);
        this._currentNode = this._root;
    }

    public get current(): MoveNode {
        return this._currentNode;
    }

    public get rootNode(): MoveNode {
        return this._root;
    }

    /**
     * Adds a move to the current node.
     * If the move already exists as a child (same notation), navigates to it.
     * If other children exist but not this one, adds it as a new variation.
     */
    public addMove(move: MoveRecord, snapshot?: PositionSnapshot): void {
        const existingChildIndex = this._currentNode.children.findIndex(
            child => child.move.notation === move.notation
        );

        if (existingChildIndex >= 0) {
            // Move already exists, just navigate to it
            // Optionally promote it to main line? For now, just select it.
            this._currentNode.selectedChildIndex = existingChildIndex;
            this._currentNode = this._currentNode.children[existingChildIndex];
            
            // Update snapshot if provided and missing (e.g. from PGN import)
            if (snapshot && !this._currentNode.snapshot) {
                this._currentNode.snapshot = snapshot;
            }
        } else {
            // Create new child
            const newNode = this.createNode(move, this._currentNode, snapshot);
            this._currentNode.children.push(newNode);
            
            // IMPORTANT: Only set selectedChildIndex if this is the FIRST child.
            // Otherwise, keep the existing main line selection and this becomes a variation.
            if (this._currentNode.children.length === 1) {
                this._currentNode.selectedChildIndex = 0;
            }
            
            this._currentNode = newNode;
        }
    }

    public findNodeById(id: string, startNode: MoveNode = this._root): MoveNode | null {
        if (startNode.id === id) return startNode;
        for (const child of startNode.children) {
            const found = this.findNodeById(id, child);
            if (found) return found;
        }
        return null;
    }

    public navigateBack(): boolean {
        if (this._currentNode.parent) {
            this._currentNode = this._currentNode.parent;
            return true;
        }
        return false;
    }

    public navigateForward(): boolean {
        if (this._currentNode.children.length > 0) {
            const index = this._currentNode.selectedChildIndex;
            if (this._currentNode.children[index]) {
                this._currentNode = this._currentNode.children[index];
                return true;
            }
        }
        return false;
    }

    public goToRoot(): void {
        this._currentNode = this._root;
    }

    public setCurrentNode(node: MoveNode): void {
        this._currentNode = node;
    }

    /**
     * Navigates to a specific move index in the current SELECTED line.
     * Index 0 = First Move.
     * Index -1 = Root.
     * 
     * IMPORTANT: This follows the selectedChildIndex at each level from root,
     * NOT the path from the current node. This ensures correct positioning
     * when stepping back in analysis mode before making a new move.
     */
    public navigateToIndex(index: number): void {
        if (index < -1) return;
        
        // Index -1 means go to root
        if (index === -1) {
            this._currentNode = this._root;
            return;
        }
        
        // Traverse from root, following selected children
        let node = this._root;
        for (let i = 0; i <= index; i++) {
            if (node.children.length === 0) {
                // No more children, stop at this node
                break;
            }
            const selectedIdx = node.selectedChildIndex;
            if (selectedIdx >= 0 && selectedIdx < node.children.length) {
                node = node.children[selectedIdx];
            } else if (node.children.length > 0) {
                // Fallback to first child if selectedChildIndex is invalid
                node = node.children[0];
            } else {
                break;
            }
        }
        
        this._currentNode = node;
    }

    /**
     * Gets the full history (MoveRecord[]) from root to current node.
     * Used for recreating Board state.
     */
    public getHistoryLine(): MoveRecord[] {
        const history: MoveRecord[] = [];
        let node: MoveNode | null = this._currentNode;
        while (node && node !== this._root) {
            history.unshift(node.move);
            node = node.parent;
        }
        return history;
    }
    
    /**
     * Creates a deep clone of the MoveTree.
     * Essential for React state updates to remain pure.
     */
    public clone(): MoveTree {
        const newTree = new MoveTree();
        
        // ID map to help restore currentNode reference if needed, 
        // but replaying the path is more robust if IDs were to change.
        const cloneSubtree = (node: MoveNode, parent: MoveNode | null): MoveNode => {
            const newNode: MoveNode = {
                ...node,
                parent,
                children: [] // will be populated
            };
            newNode.children = node.children.map(c => cloneSubtree(c, newNode));
            return newNode;
        };

        const newRoot = cloneSubtree(this._root, null);
        newTree._root = newRoot;
        
        // Replay path from root to currentNode to set the new currentNode
        const pathIndices: number[] = [];
        let temp: MoveNode | null = this._currentNode;
        while (temp && temp.parent) {
            const index = temp.parent.children.indexOf(temp);
            pathIndices.unshift(index);
            temp = temp.parent;
        }

        let newCurr = newRoot;
        for (const idx of pathIndices) {
            if (newCurr.children[idx]) {
                newCurr = newCurr.children[idx];
            }
        }
        newTree._currentNode = newCurr;

        return newTree;
    }

    /**
     * EXPERIMENTAL: Returns specific variation line.
     */

    /**
     * Gets the game state snapshot for a specific node.
     * Consolidates view state logic - works for both live and analysis mode.
     * 
     * @param viewNodeId - Node ID to get state for, or null for live (current) position
     * @returns The HistoryEntry snapshot, or null if not found/at start
     * 
     * @example
     * const snapshot = moveTree.getViewState(viewNodeId);
     * if (snapshot) displayBoard(snapshot.pieces);
     */
    public getViewState(viewNodeId: string | null): PositionSnapshot | null {
        if (viewNodeId === null) {
            // Live position - return current node's snapshot
            return this._currentNode.snapshot || null;
        }
        
        // Analysis mode - find the specific node
        const viewNode = this.findNodeById(viewNodeId);
        return viewNode?.snapshot || null;
    }

    /**
     * Checks if currently viewing the live (most recent) position.
     * Useful for determining if player can make moves.
     * 
     * @param viewNodeId - Current view node ID (null = live)
     * @returns true if at live position, false if viewing history
     */
    public isAtLivePosition(viewNodeId: string | null): boolean {
        return viewNodeId === null;
    }

    /**
     * Gets the node for a given viewNodeId.
     * @param viewNodeId - Node ID to find, or null for current node
     * @returns The MoveNode or null
     */
    public getViewNode(viewNodeId: string | null): MoveNode | null {
        if (viewNodeId === null) {
            return this._currentNode;
        }
        return this.findNodeById(viewNodeId);
    }
}

