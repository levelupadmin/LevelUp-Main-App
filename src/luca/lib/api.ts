import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { flag } from "@/lib/flags";
import { setZone, syncClock } from "./time";
import type { Desk, MyProgram, Room } from "./types";

/**
 * LUCA's RPCs are not in the generated Supabase types (they ship in this
 * branch's own migrations), so calls go through one narrow, untyped seam.
 * Every function asserts access server-side; nothing here is authorisation.
 */
type RpcResult<T> = { data: T | null; error: { message: string; code?: string } | null };
const rawRpc = supabase.rpc.bind(supabase) as unknown as <T>(fn: string, args?: Record<string, unknown>) => Promise<RpcResult<T>>;

export class LucaError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.code = code;
  }
}

/** Server messages are short keys ("niche", "link 2") or sentences; make them human. */
function friendly(msg: string): string {
  const m = msg.trim();
  const map: Record<string, string> = {
    niche: "Write your niche in a line (at least 3 characters).",
    handle: "That handle is too long.",
    track: "Pick a track.",
    why: "Pick the reason that's most true.",
    hours: "Confirm you can give about 11 hours a week.",
    email: "We need an email address on your account to apply.",
    name: "We need your name on your account to apply.",
    "summary link": "Paste a link to your 60-second summary.",
    link: "That doesn't look like a link.",
    log: "Write a line about what you did today.",
    note: "Notes can be up to 500 characters.",
    verdict: "Pick Ship, Fix or Hold.",
  };
  if (map[m]) return map[m];
  if (/^link \d+$/.test(m)) return `Link ${m.split(" ")[1]} doesn't look right. Paste the full https:// link.`;
  return m.charAt(0).toUpperCase() + m.slice(1) + (/[.!?]$/.test(m) ? "" : ".");
}

export async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await rawRpc<T>(fn, args);
  if (error) throw new LucaError(friendly(error.message || "Something went wrong"), error.code);
  return data as T;
}

/** The LUCA surface flag (client side). Authorisation stays on the server. */
export const LUCA_FLAG = "VITE_LUCA";
export const lucaFlagOn = () => flag(LUCA_FLAG);

export const roomKey = (slug: string) => ["luca", "room", slug] as const;

export function useRoom(slug: string | undefined) {
  return useQuery({
    queryKey: roomKey(slug ?? ""),
    enabled: !!slug,
    staleTime: 20_000,
    refetchOnWindowFocus: true,
    retry: 1,
    queryFn: async () => {
      const room = await rpc<Room | null>("luca_room", { p_slug: slug });
      if (room) {
        syncClock(room.server_now);
        setZone(room.program.timezone);
      }
      return room;
    },
  });
}

/** Refetch the room after a mutation, without blanking the screen. */
export function useRefreshRoom(slug: string | undefined) {
  const qc = useQueryClient();
  return useCallback(() => qc.invalidateQueries({ queryKey: roomKey(slug ?? "") }), [qc, slug]);
}

export function useMyPrograms(enabled = true) {
  return useQuery({
    queryKey: ["luca", "mine"],
    enabled,
    staleTime: 60_000,
    queryFn: () => rpc<MyProgram[]>("luca_my_programs"),
  });
}

export function useDesk(slug: string | undefined) {
  return useQuery({
    queryKey: ["luca", "desk", slug],
    enabled: !!slug,
    staleTime: 10_000,
    queryFn: () => rpc<Desk>("luca_desk", { p_slug: slug }),
  });
}

export function useNotes(sessionId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ["luca", "notes", sessionId],
    enabled: !!sessionId && enabled,
    queryFn: () => rpc<{ id: string; at_sec: number; body: string }[]>("luca_notes", { p_session: sessionId }),
  });
}

/** The server-side surface switch. While off, only staff see LUCA. */
export function useSurface(enabled: boolean) {
  return useQuery({
    queryKey: ["luca", "surface"],
    enabled,
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: async () => {
      try {
        return (await rpc<boolean>("luca_surface_enabled")) === true;
      } catch {
        return false;
      }
    },
  });
}
