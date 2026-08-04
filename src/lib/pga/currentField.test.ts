import { describe, expect, it } from "vitest";
import {
  buildPgaCurrentFieldKeys,
  buildPgaCurrentFieldPlayerIdMap,
  type PgaCurrentField,
} from "@/lib/pga/currentField";

const field: PgaCurrentField = {
  tournament: "Test Championship",
  source: "test",
  players: ["Matt McCarty", "Nico Echavarria"],
  playerDetails: [
    { id: "101", name: "Matt McCarty" },
    { id: "202", name: "Nico Echavarria" },
  ],
};

const modeledPlayers = [
  { player: "Matthew McCarty" },
  { player: "Nicolas Echavarria" },
];

describe("PGA current-field identity", () => {
  it("resolves official field aliases to canonical model keys", () => {
    expect([...buildPgaCurrentFieldKeys(field, true, modeledPlayers)]).toEqual([
      "matthewmccarty",
      "nicolasechavarria",
    ]);
  });

  it("attaches official player IDs to the resolved canonical identity", () => {
    expect(buildPgaCurrentFieldPlayerIdMap(field, modeledPlayers)).toEqual(new Map([
      ["matthewmccarty", "101"],
      ["nicolasechavarria", "202"],
    ]));
  });
});
