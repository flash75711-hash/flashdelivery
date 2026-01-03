import { useState, useEffect } from 'react';

interface CountdownTime {
  hours: number;
  minutes: number;
  seconds: number;
}

interface UseOrderCountdownResult {
  countdown: CountdownTime;
  isExpired: boolean;
}

export const useOrderCountdown = (deadline: string | null): UseOrderCountdownResult => {
  const [countdown, setCountdown] = useState<CountdownTime>({
    hours: 0,
    minutes: 0,
    seconds: 0,
  });
  const [isExpired, setIsExpired] = useState<boolean>(false);

  useEffect(() => {
    if (!deadline) {
      setIsExpired(true);
      return;
    }

    const calculateTimeRemaining = () => {
      const now = new Date().getTime();
      const deadlineTime = new Date(deadline).getTime();
      const distance = deadlineTime - now;

      if (distance < 0) {
        setIsExpired(true);
        setCountdown({ hours: 0, minutes: 0, seconds: 0 });
        return;
      }

      const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((distance % (1000 * 60)) / 1000);

      setCountdown({ hours, minutes, seconds });
      setIsExpired(false);
    };

    calculateTimeRemaining(); // Initial calculation
    const interval = setInterval(calculateTimeRemaining, 1000);

    return () => clearInterval(interval);
  }, [deadline]);

  return { countdown, isExpired };
};










