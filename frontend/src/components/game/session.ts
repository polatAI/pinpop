import { storage } from "@/lib/utils";

/** What a player's device remembers so it can rejoin after a refresh or a dropped connection. */
export interface StoredPlayer {
  pin: string;
  playerToken: string;
  playerId: string;
  nickname: string;
  avatar: string;
}

export const playerKey = (pin: string) => `pinpop:player:${pin}`;
export const hostKey = (pin: string) => `pinpop:host:${pin}`;

export const loadPlayer = (pin: string) => storage.getJSON<StoredPlayer>(playerKey(pin));
export const savePlayer = (p: StoredPlayer) => storage.setJSON(playerKey(p.pin), p);
export const forgetPlayer = (pin: string) => storage.remove(playerKey(pin));
