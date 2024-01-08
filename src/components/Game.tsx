import { Component } from 'react';
import { Piece } from '../Classes/Piece';
import { Hex } from '../Classes/Hex';
import { PieceType, NSquaresc, turnPhase,Color } from '../Constants';
import { startingBoard, riverHexes,castleHexes,layout, colorClassMap  } from '../ConstantImports';
import { Move } from '../Classes/Move';
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
    legalMoves: Array<Move>(),
    legalAttacks: Array<Move>(),
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
    //Movement logic
    if(this.turn_phase === 'Movement' && pieceClicked.color === this.currentPlayer){ 
      if (movingPiece) {//No capturing allowed in movement phase
      }
      else {//Piece is selected and legal moves are calculated
        const legalMoves = pieceClicked.legalmoves(this.blockedHexes);
        this.setState({ movingPiece: pieceClicked, legalMoves });
      }
    
    
    
    }

    //************ATTACK LOGIC************//
    if (movingPiece && this.turn_phase === 'Attack' && pieceClicked.color !== this.currentPlayer 
    && this.state.legalAttacks.some(attack => attack.end.equals(pieceClicked.hex))) {
      //Capures piece or snaps back to original position if same piece is clicked
      if (pieceClicked.type === 'Monarch') {
        alert(`${pieceClicked.color} wins!`);
        return;
      }
  
      // Update the movingPiece's position
      movingPiece.hex = pieceClicked.hex;
      // Remove the captured piece from the board
        const pieces = this.state.pieces.filter(piece => piece !== pieceClicked);
      const legalAttacks :Hex[] = [];
     //If the moveing piece is the clicked piece we don't increment the turn counter
      if(movingPiece === pieceClicked){
        turnCounter = turnCounter - 1;}

      this.setState({ movingPiece: null, legalAttacks, pieces, turnCounter: turnCounter+1 });
    } else if(this.turn_phase === 'Attack') {//Piece is selected and legal Attacks are calculated
      console.log("Attack! " + pieceClicked.type);
      const legalAttacks = pieceClicked.legalAttacks(this.enemyHexes);
      this.setState({ movingPiece: pieceClicked, legalAttacks });
      console.log("The legal attacks are " + legalAttacks);
    }
    else if(this.turn_phase === 'Movement' && pieceClicked.color === this.currentPlayer){//Piece is selected and legal moves are calculated
      const legalMoves = pieceClicked.legalmoves(this.blockedHexes);
      this.setState({ movingPiece: pieceClicked, legalMoves });
    }

                                                 //*********END OF PIECE CLICK LOGIC********//
  };

                                    //*****MOVEMENT LOGIC**************//
handleHexClick = (hex: Hex) => {
  const { movingPiece, turnCounter } = this.state;

  if (movingPiece&& this.turn_phase === 'Movement') {
    if(this.state.legalMoves.some(move => move.end.q === hex.q && move.end.r === hex.r)){//Makes a legal move
    this.setState({ movingPiece: null, legalMoves: [],turnCounter: turnCounter+1 });
    // console.log("Hi the moving pieces hex was " + movingPiece.hex.q + " " + movingPiece.hex.r);
    // console.log("The piece moved to " + hex.q + " " + hex.r);
    // console.log("The legal moves should be " + [movingPiece.hex.q + 1, movingPiece.hex.r - 1, movingPiece.hex.s] + " " + [movingPiece.hex.q, movingPiece.hex.s - 1, movingPiece.hex.r + 1] + " " + [movingPiece.hex.q - 1, movingPiece.hex.r, movingPiece.hex.s + 1]);
    // console.log("The occupied hexes are " + this.state.occupiedHexes);
    // console.log("The river hexes are " + this.state.riverHexes);
    movingPiece.hex = hex;//Update piece position
  }
} else { this.setState({ movingPiece: null, legalMoves: [] });}//Illegal move, snap back to original position

};

componentDidMount() {
  this.hexagons.forEach(hex => {
    colorClassMap[hex.getKey()] = hex.colorClass(riverHexes, castleHexes);
  });
  console.log('colorClassMap:', colorClassMap);
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
    console.log('hexagons:', this.hexagons);
    console.log('pieces:', this.state.pieces);
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
         
        // Check if the hexagon is a legal move
        //console.log(this.state.legalMoves);
        const isLegalMove = this.state.legalMoves.some(move => move.end.q === hex.q && move.end.r === hex.r);
        const isLegalAttack = this.state.legalAttacks.some(attack => attack.end.q === hex.q && attack.end.r === hex.r);
        if (isLegalMove) {
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
        }else if(isLegalAttack){
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