import { useEffect, useReducer, useRef } from "react";

interface State<T> {
  data?: T;
  error?: Error;
  isLoading: Boolean;
}

// discriminated union type
type Action<T> =
  | { type: "loading" }
  | { type: "fetched"; payload: T }
  | { type: "error"; payload: Error };

export function useFetch<T = unknown>(
  url: string,
  options?: RequestInit,
): State<T> {
  // Used to prevent state update if the component is unmounted
  const cancelRequest = useRef<boolean>(false);

  const initialState: State<T> = {
    isLoading: true,
  };

  // Keep state logic separated
  const fetchReducer = (state: State<T>, action: Action<T>): State<T> => {
    switch (action.type) {
      case "loading":
        return { ...initialState };
      case "fetched":
        return {
          ...initialState,
          data: action.payload,
          isLoading: false,
        };
      case "error":
        return {
          ...initialState,
          error: action.payload,
          isLoading: false,
        };
      default:
        return state;
    }
  };

  const [state, dispatch] = useReducer(fetchReducer, initialState);

  useEffect(() => {
    cancelRequest.current = false;

    const fetchData = async () => {
      dispatch({ type: "loading" });

      try {
        const response = await fetch(url, options);
        if (!response.ok) {
          throw new Error(response.statusText);
        }

        const data = (await response.json()) as T;
        if (cancelRequest.current) return;

        dispatch({ type: "fetched", payload: data });
      } catch (error) {
        if (cancelRequest.current) return;

        dispatch({ type: "error", payload: error as Error });
      }
    };

    void fetchData();

    // Avoid a possible state update after the component was unmounted
    return () => {
      cancelRequest.current = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  return state;
}
