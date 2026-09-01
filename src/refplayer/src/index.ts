// @tns/refplayer
// A reference player: implements the contract validly but badly.
//
// Specification: PLAYER-CONTRACT.md §14.
//
// This is the floor a real solution must beat, and a smoke test for the
// simulator. It is deliberately naive — it fetches the timetable once, builds a
// crude index, and runs a two-round earliest-arrival search. It does no
// reconciliation, because at M1 there is only one operator and nothing to
// reconcile; that is exactly what makes M1 a walking skeleton rather than the
// game.
//
// Note what it does *not* get: canonical identifiers. It sees only what the
// operator publishes, and answers using those same published identifiers
// (PLAYER-CONTRACT.md §7). Its whole world is one HTTP endpoint.

export const PACKAGE_NAME = "@tns/refplayer";

export * from "./player.ts";
