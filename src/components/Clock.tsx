import React, { useState, useEffect } from "react";
import { Color } from "../Constants";

interface ChessClockProps {
  initialTime: number; // in seconds
  increment?: number; // in seconds
  isActive: boolean;
  player: Color;
}

const ChessClock: React.FC<ChessClockProps> = ({
  initialTime,
  increment = 0,
  isActive,
  player,
}) => {
  const [timeLeft, setTimeLeft] = useState(initialTime);

  // Handle increment when turn ends
  useEffect(() => {
    if (!isActive) {
        setTimeLeft(prev => prev + increment);
    }
  }, [isActive, increment]);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isActive && timeLeft > 0) {
      timer = setInterval(() => {
        setTimeLeft((prev) => Math.max(0, prev - 1));
      }, 1000);
    }

    return () => {
      if (timer) {
        clearInterval(timer);
      }
    };
  }, [isActive, timeLeft]);

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;

  return (
    <div className={`clock-box ${player} ${isActive ? "active" : ""}`}>
      {minutes}:{seconds < 10 ? `0${seconds}` : seconds}
    </div>
  );
};

export default ChessClock;
