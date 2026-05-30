import { Board } from "../Classes/Core/Board";
import { GameState, PositionSnapshot } from "../Classes/Core/GameState";
import { MoveTree } from "../Classes/Core/MoveTree";
import { Castle } from "../Classes/Entities/Castle";
import { Hex } from "../Classes/Entities/Hex";
import { Piece } from "../Classes/Entities/Piece";
import { PieceFactory } from "../Classes/Entities/PieceFactory";
import { Sanctuary } from "../Classes/Entities/Sanctuary";
import { GameEngine } from "../Classes/Core/GameEngine";
import { SanctuaryConfig, SanctuaryType } from "../Constants";
import { createPieceMap } from "../utils/PieceMap";
import {
  BoardDTO,
  CastleDTO,
  GameStateDTO,
  HexDTO,
  OnlineGameSetupDTO,
  PieceDTO,
  SanctuaryDTO,
} from "./types";

export interface OnlineSetupInput {
  board: Board;
  pieces: Piece[];
  sanctuaries: Sanctuary[];
  sanctuarySettings?: { unlockTurn: number; cooldown: number };
  gameRules?: { vpModeEnabled: boolean };
  initialPoolTypes?: SanctuaryType[];
  pieceTheme?: OnlineGameSetupDTO["pieceTheme"];
  timeControl?: { initial: number; increment: number };
}

export interface HydratedOnlineGameSetup {
  board: Board;
  pieces: Piece[];
  sanctuaries: Sanctuary[];
  sanctuarySettings?: { unlockTurn: number; cooldown: number };
  gameRules?: { vpModeEnabled: boolean };
  initialPoolTypes?: SanctuaryType[];
  pieceTheme?: OnlineGameSetupDTO["pieceTheme"];
  timeControl?: { initial: number; increment: number };
}

export interface HydratedOnlineState {
  board: Board;
  state: GameState;
  gameEngine: GameEngine;
}

export function serializeHex(hex: Hex): HexDTO {
  return {
    q: hex.q,
    r: hex.r,
    s: hex.s,
    colorIndex: hex.color_index,
  };
}

export function hydrateHexDTO(dto: HexDTO): Hex {
  return new Hex(dto.q, dto.r, dto.s, dto.colorIndex ?? 0);
}

export function serializePiece(piece: Piece): PieceDTO {
  return {
    hex: serializeHex(piece.hex),
    color: piece.color,
    type: piece.type,
    canMove: piece.canMove,
    canAttack: piece.canAttack,
    damage: piece.damage,
    abilityUsed: piece.abilityUsed,
    souls: piece.souls,
    isRevived: piece.isRevived,
  };
}

export function hydratePieceDTO(dto: PieceDTO): Piece {
  return PieceFactory.create(dto.type, hydrateHexDTO(dto.hex), dto.color).with({
    canMove: dto.canMove,
    canAttack: dto.canAttack,
    damage: dto.damage,
    abilityUsed: dto.abilityUsed,
    souls: dto.souls,
    isRevived: dto.isRevived,
  });
}

export function serializeCastle(castle: Castle): CastleDTO {
  return {
    hex: serializeHex(castle.hex),
    color: castle.color,
    turnsControlled: castle.turns_controlled,
    usedThisTurn: castle.used_this_turn,
    owner: castle.owner,
  };
}

export function hydrateCastleDTO(dto: CastleDTO): Castle {
  return new Castle(
    hydrateHexDTO(dto.hex),
    dto.color,
    dto.turnsControlled,
    dto.usedThisTurn,
    dto.owner
  );
}

export function serializeSanctuary(sanctuary: Sanctuary): SanctuaryDTO {
  return {
    hex: serializeHex(sanctuary.hex),
    type: sanctuary.type,
    territorySide: sanctuary.territorySide,
    controller: sanctuary.controller,
    cooldown: sanctuary.cooldown,
    hasPledgedThisGame: sanctuary.hasPledgedThisGame,
  };
}

export function hydrateSanctuaryDTO(dto: SanctuaryDTO): Sanctuary {
  return new Sanctuary(
    hydrateHexDTO(dto.hex),
    dto.type,
    dto.territorySide,
    dto.controller,
    dto.cooldown,
    dto.hasPledgedThisGame
  );
}

export function serializeBoard(board: Board): BoardDTO {
  return {
    config: { ...board.config },
    castles: board.castles.map(serializeCastle),
  };
}

export function hydrateBoardDTO(dto: BoardDTO): Board {
  return new Board({ ...dto.config }, dto.castles.map(hydrateCastleDTO));
}

export function serializeOnlineGameSetup(input: OnlineSetupInput): OnlineGameSetupDTO {
  return {
    board: serializeBoard(input.board),
    pieces: input.pieces.map(serializePiece),
    sanctuaries: input.sanctuaries.map(serializeSanctuary),
    sanctuarySettings: input.sanctuarySettings,
    gameRules: input.gameRules,
    initialPoolTypes: input.initialPoolTypes ? [...input.initialPoolTypes] : undefined,
    pieceTheme: input.pieceTheme,
    timeControl: input.timeControl,
  };
}

export function hydrateOnlineGameSetupDTO(
  dto: OnlineGameSetupDTO
): HydratedOnlineGameSetup {
  return {
    board: hydrateBoardDTO(dto.board),
    pieces: dto.pieces.map(hydratePieceDTO),
    sanctuaries: dto.sanctuaries.map(hydrateSanctuaryDTO),
    sanctuarySettings: dto.sanctuarySettings,
    gameRules: dto.gameRules,
    initialPoolTypes: dto.initialPoolTypes ? [...dto.initialPoolTypes] : undefined,
    pieceTheme: dto.pieceTheme,
    timeControl: dto.timeControl,
  };
}

export function serializeGameState(state: GameState): GameStateDTO {
  return {
    pieces: state.pieces.map(serializePiece),
    castles: state.castles.map(serializeCastle),
    sanctuaries: state.sanctuaries.map(serializeSanctuary),
    turnCounter: state.turnCounter,
    sanctuaryPool: [...state.sanctuaryPool],
    graveyard: state.graveyard.map(serializePiece),
    phoenixRecords: state.phoenixRecords.map((record) => ({ ...record })),
    promotionPending: state.promotionPending
      ? serializePiece(state.promotionPending)
      : null,
    victoryPoints: state.victoryPoints ? { ...state.victoryPoints } : undefined,
  };
}

export function hydrateGameStateDTO(
  dto: GameStateDTO,
  setup: OnlineGameSetupDTO,
  moveTree: MoveTree = createMoveTreeFromHistory([], dto)
): GameState {
  const hydratedSetup = hydrateOnlineGameSetupDTO(setup);
  const pieces = dto.pieces.map(hydratePieceDTO);
  return {
    pieces,
    pieceMap: createPieceMap(pieces),
    castles: dto.castles.map(hydrateCastleDTO),
    sanctuaries: dto.sanctuaries.map(hydrateSanctuaryDTO),
    sanctuaryPool: [...dto.sanctuaryPool],
    turnCounter: dto.turnCounter,
    graveyard: dto.graveyard.map(hydratePieceDTO),
    phoenixRecords: dto.phoenixRecords.map((record) => ({ ...record })),
    victoryPoints: dto.victoryPoints ? { ...dto.victoryPoints } : undefined,
    promotionPending: dto.promotionPending
      ? hydratePieceDTO(dto.promotionPending)
      : null,
    movingPiece: null,
    moveTree,
    viewNodeId: null,
    sanctuarySettings: hydratedSetup.sanctuarySettings,
    gameRules: hydratedSetup.gameRules,
  };
}

export function createInitialStateFromSetupDTO(
  setupDTO: OnlineGameSetupDTO
): HydratedOnlineState {
  const setup = hydrateOnlineGameSetupDTO(setupDTO);
  const gameEngine = new GameEngine(setup.board);
  const pieces = setup.pieces.map((piece) => piece.clone());
  const castles = setup.board.castles.map((castle) => castle.clone());
  const sanctuaries = setup.sanctuaries.map((sanctuary) => sanctuary.clone());
  const sanctuaryPool =
    setup.initialPoolTypes ??
    (Object.values(SanctuaryType).filter((type): type is SanctuaryType => {
      if (sanctuaries.some((sanctuary) => sanctuary.type === type)) return false;
      return SanctuaryConfig[type].startAvailable === true;
    }) as SanctuaryType[]);

  const moveTree = new MoveTree();
  const rootSnapshot: PositionSnapshot = {
    pieces: pieces.map((piece) => piece.clone()),
    pieceMap: createPieceMap(pieces),
    castles: castles.map((castle) => castle.clone()),
    sanctuaries: sanctuaries.map((sanctuary) => sanctuary.clone()),
    sanctuaryPool: [...sanctuaryPool],
    turnCounter: 0,
    graveyard: [],
    phoenixRecords: [],
  };
  moveTree.rootNode.snapshot = rootSnapshot;

  const initialState: GameState = {
    pieces,
    pieceMap: createPieceMap(pieces),
    castles,
    sanctuaries,
    sanctuaryPool: [...sanctuaryPool],
    turnCounter: 0,
    graveyard: [],
    phoenixRecords: [],
    promotionPending: null,
    movingPiece: null,
    moveTree,
    viewNodeId: null,
    sanctuarySettings: setup.sanctuarySettings,
    gameRules: setup.gameRules,
  };

  return {
    board: setup.board,
    gameEngine,
    state: gameEngine.normalizeForcedTurns(initialState),
  };
}

export function createMoveTreeFromHistory(
  history: GameState["moveTree"]["current"]["move"][],
  currentState?: GameStateDTO
): MoveTree {
  const tree = new MoveTree();
  for (const record of history) {
    tree.addMove(record);
  }

  if (currentState) {
    const pieces = currentState.pieces.map(hydratePieceDTO);
    tree.current.snapshot = {
      pieces,
      pieceMap: createPieceMap(pieces),
      castles: currentState.castles.map(hydrateCastleDTO),
      sanctuaries: currentState.sanctuaries.map(hydrateSanctuaryDTO),
      sanctuaryPool: [...currentState.sanctuaryPool],
      turnCounter: currentState.turnCounter,
      graveyard: currentState.graveyard.map(hydratePieceDTO),
      phoenixRecords: currentState.phoenixRecords.map((record) => ({ ...record })),
      victoryPoints: currentState.victoryPoints
        ? { ...currentState.victoryPoints }
        : undefined,
    };
  }

  return tree;
}

