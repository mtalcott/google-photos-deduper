import { io } from "socket.io-client";
import { WS_URL } from "utils";

export const socket = io(WS_URL);
