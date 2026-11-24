import { io, type Socket } from "socket.io-client";
import type { Ack, ClientToServerEvents, ServerToClientEvents } from "@/shared";

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: GameSocket | null = null;

/** One shared Socket.IO connection per tab. */
export function getSocket(): GameSocket {
  if (!socket) {
    socket = io({
      path: "/socket.io",
      transports: ["websocket", "polling"],
      reconnectionDelay: 500,
      reconnectionDelayMax: 3000,
    });
  }
  return socket;
}

type AckResult<T> = Parameters<Ack<T>>[0];

export class GameRequestError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}

/** Emits an event that expects an ack and resolves with its data (or rejects with the error code). */
export function emitAck<T = void>(emit: (ack: (res: AckResult<T>) => void) => void, timeoutMs = 8000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new GameRequestError("timeout")), timeoutMs);
    emit((res) => {
      clearTimeout(timer);
      if (res.ok) resolve(res.data);
      else reject(new GameRequestError(res.error));
    });
  });
}
