import { useEffect, useRef } from "react";

// See https://stackoverflow.com/a/53024497/379231,
// https://overreacted.io/making-setinterval-declarative-with-react-hooks/

export function useInterval(callback, delay) {
  const savedCallback = useRef();

  // Remember the latest callback.
  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  // Set up the interval.
  useEffect(() => {
    function tick() {
      if (savedCallback.current) {
        savedCallback.current();
      }
    }
    if (delay !== null) {
      let id = setInterval(tick, delay);
      tick();
      return () => clearInterval(id);
    }
  }, [delay]);
}
