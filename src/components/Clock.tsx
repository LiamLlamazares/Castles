import React, { useState, useEffect } from 'react';

interface ChessClockProps {
  initialTime: number; // in seconds
  isActive: boolean;
}

const ChessClock: React.FC<ChessClockProps> = ({ initialTime, isActive }) => {
    const [timeLeft, setTimeLeft] = useState(initialTime);

    useEffect(() => {
        let timer: NodeJS.Timeout;
        if (isActive) {
            timer = setInterval(() => {
                setTimeLeft(timeLeft => timeLeft - 1);
            }, 1000);
        }

        return () => {
            if (timer) {
                clearInterval(timer);
            }
        };
    }, [isActive]);

    const minutes = Math.floor(timeLeft / 60);
    const seconds = timeLeft % 60;

    return (
        <div>
            {minutes}:{seconds < 10 ? `0${seconds}` : seconds}
        </div>
    );
};

export default ChessClock;