import React, { useState, useEffect } from "react";
import { Color } from "../Constants";

interface ChessClockProps {
  initialTime: number; // in seconds
  isActive: boolean;
  player: Color;
}

const ChessClock: React.FC<ChessClockProps> = ({
  initialTime,
  isActive,
  player,
}) => {
  const [timeLeft, setTimeLeft] = useState(initialTime);

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
    <div
      style={{
        backgroundColor: player === "w" ? "white" : "black",
        color: timeLeft < 180 ? "red" : player === "w" ? "black" : "white",
        padding: "10px",
        borderRadius: "5px",
        margin: "10px",
        textAlign: "center",
        border: isActive ? "5px solid green" : "none",
      }}
    >
      {player.toUpperCase()} - {minutes}:
      {seconds < 10 ? `0${seconds}` : seconds}
    </div>
  );
};

export default ChessClock;
