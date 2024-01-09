import { Component } from 'react';
import { Piece } from '../Classes/Piece';
import {Castle} from '../Classes/Castle';
import { Hex } from '../Classes/Hex';
import { PieceType, NSquaresc, turnPhase,Color } from '../Constants';
import { startingBoard, riverHexes,castleHexes,whiteCastleHexes, blackCastleHexes, layout, colorClassMap, startingCastles  } from '../ConstantImports';
import "../css/Board.css";

import wswordsmanImage from '../Assets/Images/Chess/wSwordsman.svg';
import bswordsmanImage from '../Assets/Images/Chess/bSwordsman.svg';
import wdragonImage from '../Assets/Images/Chess/wDragon.svg';
import bdragonImage from '../Assets/Images/Chess/bDragon.svg';
import warcherImage from '../Assets/Images/Chess/wArcher.svg';
import barcherImage from '../Assets/Images/Chess/bArcher.svg';
import wgiantImage from '../Assets/Images/Chess/wGiant.svg';
import bgiantImage from '../Assets/Images/Chess/bGiant.svg';
import wassassinImage from '../Assets/Images/Chess/wAssassin.svg';
import bassassinImage from '../Assets/Images/Chess/bAssassin.svg';
import wmonarchImage from '../Assets/Images/Chess/wMonarch.svg';
import bmonarchImage from '../Assets/Images/Chess/bMonarch.svg';
import wtrebuchetImage from '../Assets/Images/Chess/wTrebuchet.svg';
import btrebuchetImage from '../Assets/Images/Chess/bTrebuchet.svg';
import wknightImage from '../Assets/Images/Chess/wKnight.svg';
import bknightImage from '../Assets/Images/Chess/bKnight.svg';
import weagleImage from '../Assets/Images/Chess/wEagle.svg';
import beagleImage from '../Assets/Images/Chess/bEagle.svg';





class GameBoard extends Component {
  state = {
    history: [],
    pieces: startingBoard.pieces as Piece[], // We need to cast the pieces to Piece type because they are initially created as object literals
    movingPiece: null as Piece | null,
    showCoordinates: false,
    turnCounter: 0 as number,
    Castles:  startingCastles as Castle[],
    cheatMode: false,

  };

  get turn_phase(): turnPhase {
    return this.state.turnCounter % 5 < 2 ? 'Movement' : this.state.turnCounter % 5 < 4 ? 'Attack' : 'Castles';
  }
  get currentPlayer(): Color {
    return this.state.turnCounter % 10< 5 ? 'w' : 'b';
  }
  get hexagons(): Hex[] {
    return startingBoard.hexes;
  }
  get blockedHexes(): Hex[] {
    return [...riverHexes, ...castleHexes, ...this.occupiedHexes];
  }
  get occupiedHexes(): Hex[] {
return this.state.pieces.map(piece => piece.hex);
  }
get enemyCastleHexes(): Hex[] {
  return this.state.Castles.filter(castle => castle.color !== this.currentPlayer).map(castle => castle.hex);
}

get enemyHexes(): Hex[] {
  return this.state.pieces.filter(piece => piece.color !== this.currentPlayer).map(piece => piece.hex);
}
get attackableHexes(): Hex[] {
  return [...this.enemyHexes, ...this.enemyCastleHexes];
}

get legalMoves(): Hex[] {
  const { movingPiece } = this.state;
  if (movingPiece && this.turn_phase === 'Movement' && movingPiece.canMove) {
    const color = movingPiece.color;
    return movingPiece.legalmoves(this.blockedHexes, color);
  }
  return [];
}
//Necessary to display attacks in attack phase
get legalAttacks(): Hex[] {
  const { movingPiece } = this.state;
  if (movingPiece && this.turn_phase === 'Attack' && movingPiece.canAttack) {
    return movingPiece.legalAttacks(this.attackableHexes);
  }
  return [];
}
//Necessary to know if attack phase can be skipped
get futureLegalAttacks(): Hex[] {
  const { movingPiece } = this.state;
  if (movingPiece && movingPiece.canAttack) {
    return movingPiece.legalAttacks(this.attackableHexes);
  }
  return [];
}
//Necessary to display castle information in castles phase
get controlledCastlesActivePlayer(): Castle[] {
  return this.state.Castles.filter(castle => {
    const piece = this.state.pieces.find(piece => piece.hex.equals(castle.hex));
    return piece && piece.color !== castle.color && castle.color !== this.currentPlayer&& this.turn_phase === 'Castles';
  });
}
//Necessary to know if castles phase can be skipped
get futurecontrolledCastlesActivePlayer(): Castle[] {
  return this.state.Castles.filter(castle => {
    const piece = this.state.pieces.find(piece => piece.hex.equals(castle.hex));
    return piece && piece.color !== castle.color && castle.color !== this.currentPlayer;
  });
}

// Necessary to know by how much to increment turn counter
getTurnCounterIncrement = () => {
  // calculate if there are potential attacks
  const hasFutureAttacks = this.futureLegalAttacks.length > 0;
  const hasFutureControlledCastles = this.futurecontrolledCastlesActivePlayer.length > 0;

  if (!hasFutureAttacks && !hasFutureControlledCastles && this.turn_phase === 'Movement') {
    return 4;
  } else if (!hasFutureAttacks && hasFutureControlledCastles && this.turn_phase === 'Movement') {
    return 3;
  } else if(!hasFutureAttacks && !hasFutureControlledCastles && this.state.turnCounter % 5 === 2){
    return 3 ;
  }
  else if(!hasFutureAttacks && hasFutureControlledCastles && this.state.turnCounter % 5 === 2){
    return 2 ;
  }  else if(!hasFutureControlledCastles && this.state.turnCounter % 5 === 3){
    return 2 ;
  }else {return 1;}


}


get emptyHexesAdjacentToControlledCastles(): Hex[] {
  const adjacenthexes = this.controlledCastlesActivePlayer.map(castle => castle.hex.cubeRing(1)).flat(1);
  return adjacenthexes.filter(hex => !this.occupiedHexes.some(occupiedHex => occupiedHex.equals(hex)));
}


public hexisLegalMove = (hex: Hex) => {
  const legalMoves = this.legalMoves;
  return legalMoves.some(move => move.equals(hex));
}

public hexisLegalAttack = (hex: Hex) => {
  const legalAttacks = this.legalAttacks;
  return legalAttacks.some(attack => attack.equals(hex));
}
public hexisAdjacentToControlledCastle = (hex: Hex) => {
  const hexesAdjacentToControlledCastles = this.emptyHexesAdjacentToControlledCastles;
  return hexesAdjacentToControlledCastles.some(adjacentHex => hex.equals(adjacentHex));
}
// Add this method to your GameBoard component
handlePass = () => {
  let turnCounter = this.state.turnCounter;
  console.log('Passing. The turn counter is', turnCounter);
  

  // Check if there are any legal attacks for the current player's pieces
  const hasLegalAttacks = this.state.pieces.some(piece => 
    piece.color === this.currentPlayer && piece.legalAttacks(this.attackableHexes).length > 0
  );

  // If there are no legal attacks, increment the turn counter to reach the castles phase
  if (!hasLegalAttacks && (turnCounter % 5 === 2 || turnCounter % 5 === 3)) {
    turnCounter += 2;
  } else {
    turnCounter += 1;
  }

  this.setState({ movingPiece: null, turnCounter });
};
handleKeyDown = (event: KeyboardEvent) => {
  if (event.code === 'q') {
    this.handlePass();
  }
}


  handleTakeback = () => {
    if (this.state.history.length > 0) {
        const previousState: GameBoard | undefined = this.state.history.pop();
        if (previousState) {
            this.setState({ current: previousState });
        }
    }
}

  handlePieceClick = (pieceClicked: Piece) => {
    const { movingPiece} = this.state;
    let turnCounter = this.state.turnCounter;
  // Allow to swap the moving piece
  if (movingPiece && pieceClicked.color === this.currentPlayer) {
    this.setState({ movingPiece: pieceClicked});
    return;
  }
                                    //******** PIECE SELECTION LOGIC *******//
    else if(  ((this.turn_phase === 'Movement' && pieceClicked.canMove) ||(this.turn_phase === 'Attack'  && pieceClicked.color === this.currentPlayer&& pieceClicked.canAttack))  && pieceClicked.color === this.currentPlayer) {//Piece is selected 
      this.setState({ movingPiece: pieceClicked });
    }

                                  //************ATTACK LOGIC************//
    if (movingPiece && this.turn_phase === 'Attack' && pieceClicked.color !== this.currentPlayer 
    && this.legalAttacks.some(attack => attack.equals(pieceClicked.hex)) ) {
      //Capures piece or snaps back to original position if same piece is clicked
      if (pieceClicked.type === 'Monarch') {
        alert(`${pieceClicked.color} wins!`);
        return;
      }
  
      // Update the Pieces
      movingPiece.hex = pieceClicked.hex;
      movingPiece.canAttack = false;
        const pieces = this.state.pieces.filter(piece => piece !== pieceClicked);
     //If the moving piece is the clicked piece we don't increment the turn counter
      

      this.setState({ movingPiece: null, pieces, turnCounter: turnCounter+1 });
    }                                           
  }; //*********END OF PIECE CLICK LOGIC********//

                                    
handleHexClick = (hex: Hex) => {
  const { movingPiece, turnCounter } = this.state;
                                //*****MOVEMENT LOGIC TO HEX**************//
  if (movingPiece?.canMove&& this.turn_phase === 'Movement') {
    if(this.legalMoves.some(move => move.equals(hex))){//Makes a legal move
    this.setState({ movingPiece: null, turnCounter: turnCounter+1 });
    if (turnCounter % 5 === 1) {//All pieces can move next turn
      this.state.pieces.forEach(piece => piece.canMove = true);
    }
    movingPiece.hex = hex; //Update piece position
    movingPiece.canMove = false;
    
  }
} else if (this.turn_phase === 'Attack' && movingPiece?.canAttack) {
  if(this.legalAttacks.some(attack => attack.equals(hex))){//Makes a legal attack
    this.setState({ movingPiece: null, turnCounter: turnCounter+1 });
    movingPiece.hex = hex; //Update piece position
    movingPiece.canAttack = false;
  }


}


else { this.setState({ movingPiece: null });}//Illegal move, snap back to original position

};

componentDidMount() {
  window.addEventListener('keydown', this.handleKeyDown);
  this.hexagons.forEach(hex => {
    colorClassMap[hex.getKey()] = hex.colorClass(riverHexes, castleHexes, whiteCastleHexes, blackCastleHexes);
  });
}
//Avoids memory leak
componentWillUnmount() {
  window.removeEventListener('keydown', this.handleKeyDown);
}

  getImageByPieceType = (type: PieceType, color: string) => {
    const images: { [key in PieceType]: string } = {
      'Swordsman': color === 'w' ? wswordsmanImage : bswordsmanImage,
      'Dragon': color === 'w' ? wdragonImage : bdragonImage,
      'Archer': color === 'w' ? warcherImage : barcherImage,
      'Giant': color === 'w' ? wgiantImage : bgiantImage,
      'Assassin': color === 'w' ? wassassinImage : bassassinImage,
      'Monarch': color === 'w' ? wmonarchImage : bmonarchImage,
      'Trebuchet': color === 'w' ? wtrebuchetImage : btrebuchetImage,
      'Knight': color === 'w' ? wknightImage : bknightImage,
      'Eagle': color === 'w' ? weagleImage : beagleImage,
    };
    return images[type];
  };

  render() {
    return (
      <>
      <button className='pass-button' onClick={this.handlePass}>Pass</button>
 <button className='coordinates-button' onClick={() => this.setState({ showCoordinates: !this.state.showCoordinates })}>
          Toggle Coordinates
        </button>
        <button className='takeback-button' onClick={this.handleTakeback}>Takeback</button>
      <svg className="board" height="100%" width="100%">
        {/* Render all hexagons */}
        {this.hexagons.map((hex: Hex) => (
          <g key={hex.getKey()}>
            <polygon 
              points={layout.polygonCornersString(hex) } 
              className={`${colorClassMap[hex.getKey()]} ${this.hexisAdjacentToControlledCastle(hex) ? 'hexagon-castle-adjacent'  : ''}`} 
              onClick={() => this.handleHexClick(hex)}
            />
            {this.state.showCoordinates && (
              <text 
                x={layout.hexToPixel(hex).x} 
                y={layout.hexToPixel(hex).y+5} 
                textAnchor="middle" 
                style={{ fontSize: '15px', color: 'black' }}
              >
                {`${hex.q}, ${hex.s}`}
              </text>
            )}
          </g>
        ))}
      {/* Render dots for legal moves */}
      {this.hexagons.map((hex: Hex) => {
         
        if (this.hexisLegalMove(hex)) {
          return (
            <circle 
              key={hex.getKey()}
              cx={layout.hexToPixel(hex).x} 
              cy={layout.hexToPixel(hex).y}  
              r={90/NSquaresc} 
              className ="legalMoveDot"
              onClick={() => this.handleHexClick(hex)}
            />
          );
        }else if(this.hexisLegalAttack(hex)){
          return (
            <circle 
              key={hex.getKey()}
              cx={layout.hexToPixel(hex).x} 
              cy={layout.hexToPixel(hex).y} 
              r={90/NSquaresc} 
              className ="legalAttackDot"
              onClick={() => this.handleHexClick(hex)}
            />
          );
        }
        return null;
      })}


        {/* Render all pieces */}
        {/* We loop over pieces instead of hexagons  */}
        {this.state.pieces.map((piece: Piece) => (
          <image
            key={piece.hex.getKey()}
            href={this.getImageByPieceType(piece.type, piece.color)}
            x={layout.hexToPixel(piece.hex).x - 145/NSquaresc}
            y={layout.hexToPixel(piece.hex).y - 145/NSquaresc}
            height={275 / NSquaresc}
            width={275 / NSquaresc}
            className='piece'
            onClick={() => this.handlePieceClick(piece)}
          />
        ))}
      </svg>
      </>
    );
  }
  componentDidUpdate() {
    console.log(`The turn counter is ${this.state.turnCounter}. The turn phase is ${this.turn_phase}. It is ${this.currentPlayer}'s turn`);
  }
}

export default GameBoard;