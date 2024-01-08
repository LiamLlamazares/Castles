import { Component } from 'react';
import { Piece } from '../Classes/Piece';
import { Hex } from '../Classes/Hex';
import { PieceType, NSquaresc, turnPhase,Color } from '../Constants';
import { startingBoard, riverHexes,castleHexes,layout, colorClassMap  } from '../ConstantImports';
import "../css/Board.css";

import wswordsmanImage from '../Assets/Images/fantasyd/wSwordsman.svg';
import bswordsmanImage from '../Assets/Images/fantasyd/bSwordsman.svg';
import wdragonImage from '../Assets/Images/fantasyd/wDragon.svg';
import bdragonImage from '../Assets/Images/fantasyd/bDragon.svg';
import warcherImage from '../Assets/Images/fantasyd/wArcher.svg';
import barcherImage from '../Assets/Images/fantasyd/bArcher.svg';
import wgiantImage from '../Assets/Images/fantasyd/wGiant.svg';
import bgiantImage from '../Assets/Images/fantasyd/bGiant.svg';
import wassassinImage from '../Assets/Images/fantasyd/wAssassin.svg';
import bassassinImage from '../Assets/Images/fantasyd/bAssassin.svg';
import wmonarchImage from '../Assets/Images/fantasyd/wMonarch.svg';
import bmonarchImage from '../Assets/Images/fantasyd/bMonarch.svg';
import wtrebuchetImage from '../Assets/Images/fantasyd/wTrebuchet.svg';
import btrebuchetImage from '../Assets/Images/fantasyd/bTrebuchet.svg';
import wknightImage from '../Assets/Images/fantasyd/wKnight.svg';
import bknightImage from '../Assets/Images/fantasyd/bKnight.svg';
import weagleImage from '../Assets/Images/fantasyd/wEagle.svg';
import beagleImage from '../Assets/Images/fantasyd/bEagle.svg';





class GameBoard extends Component {
  state = {
    history: [],
    pieces: startingBoard.pieces,
    movingPiece: null as Piece | null,
    showCoordinates: false,
    turnCounter: 0
  };

  get turn_phase(): turnPhase {
    return this.state.turnCounter % 5 < 2 ? 'Movement' : this.state.turnCounter % 5 < 4 ? 'Attack' : 'Castles';
  }
  get currentPlayer(): Color {
    return this.state.turnCounter % 9< 5 ? 'w' : 'b';
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
get enemyHexes(): Hex[] {
  return this.state.pieces.filter(piece => piece.color !== this.currentPlayer).map(piece => piece.hex);
}

get legalMoves(): Hex[] {
  const { movingPiece } = this.state;
  if (movingPiece && this.turn_phase === 'Movement') {
    return movingPiece.legalmoves(this.blockedHexes);
  }
  return [];
}
get legalAttacks(): Hex[] {
  const { movingPiece } = this.state;
  if (movingPiece && this.turn_phase === 'Attack') {
    return movingPiece.legalAttacks(this.enemyHexes);
  }
  return [];
}
public hexisLegalMove = (hex: Hex) => {
  const legalMoves = this.legalMoves;
  return legalMoves.some(move => move.equals(hex));
}

public hexisLegalAttack = (hex: Hex) => {
  const legalAttacks = this.legalAttacks;
  return legalAttacks.some(attack => attack.equals(hex));
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
      if(movingPiece === pieceClicked){
        turnCounter = turnCounter - 1; movingPiece.canAttack = true;}

      this.setState({ movingPiece: null, pieces, turnCounter: turnCounter+1 });
    }                                           
  }; //*********END OF PIECE CLICK LOGIC********//

                                    //*****MOVEMENT LOGIC**************//
handleHexClick = (hex: Hex) => {
  const { movingPiece, turnCounter } = this.state;

  if (movingPiece?.canMove&& this.turn_phase === 'Movement') {
    if(this.legalMoves.some(move => move.q === hex.q && move.r === hex.r)){//Makes a legal move
    this.setState({ movingPiece: null, turnCounter: turnCounter+1 });
    movingPiece.hex = hex; //Update piece position
    movingPiece.canMove = false;
    
  }
} else { this.setState({ movingPiece: null });}//Illegal move, snap back to original position

};

componentDidMount() {
  this.hexagons.forEach(hex => {
    colorClassMap[hex.getKey()] = hex.colorClass(riverHexes, castleHexes);
  });
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
    //console.log('pieces:', this.state.pieces);
    console.log(`The turn counter is ${this.state.turnCounter}. The turn phase is ${this.turn_phase}. It is ${this.currentPlayer}'s turn`);
    return (
      <>
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
              className={colorClassMap[hex.getKey()]} 
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
            x={layout.hexToPixel(piece.hex).x - 150/NSquaresc}
            y={layout.hexToPixel(piece.hex).y - 150/NSquaresc}
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
}

export default GameBoard;