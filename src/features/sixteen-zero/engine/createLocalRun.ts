export type LocalSimulationRun = {
  simulationId: string;
  seed: string;
  draftSlot: number;
};

function secureDraftSlot() {
  const maximumAccepted = Math.floor(0x1_0000_0000 / 12) * 12;
  const values = new Uint32Array(1);
  do {
    crypto.getRandomValues(values);
  } while (values[0] >= maximumAccepted);
  return (values[0] % 12) + 1;
}

export function createLocalSimulationRun(draftSlot?: number): LocalSimulationRun {
  const seedValues = new Uint32Array(4);
  crypto.getRandomValues(seedValues);
  const resolvedSlot =
    draftSlot !== undefined && Number.isInteger(draftSlot) && draftSlot >= 1 && draftSlot <= 12
      ? draftSlot
      : secureDraftSlot();
  return {
    simulationId: crypto.randomUUID(),
    seed: Array.from(seedValues, (value) => value.toString(16).padStart(8, "0")).join(""),
    draftSlot: resolvedSlot,
  };
}

export function generateRandomDraftSlot(): number {
  return secureDraftSlot();
}

