function hashSeed(seed: string) {
  let hash = 1779033703 ^ seed.length;
  for (let index = 0; index < seed.length; index += 1) {
    hash = Math.imul(hash ^ seed.charCodeAt(index), 3432918353);
    hash = (hash << 13) | (hash >>> 19);
  }
  return () => {
    hash = Math.imul(hash ^ (hash >>> 16), 2246822507);
    hash = Math.imul(hash ^ (hash >>> 13), 3266489909);
    return (hash ^= hash >>> 16) >>> 0;
  };
}

export class SeededRandom {
  private state: number;

  private spareNormal: number | null = null;

  constructor(readonly seed: string) {
    this.state = hashSeed(seed)();
  }

  next() {
    this.state += 0x6d2b79f5;
    let value = this.state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  }

  integer(minimum: number, maximum: number) {
    if (!Number.isInteger(minimum) || !Number.isInteger(maximum) || maximum < minimum) {
      throw new Error("SeededRandom.integer requires a valid inclusive integer range.");
    }
    return Math.floor(this.next() * (maximum - minimum + 1)) + minimum;
  }

  normal(mean = 0, standardDeviation = 1) {
    if (this.spareNormal !== null) {
      const spare = this.spareNormal;
      this.spareNormal = null;
      return mean + spare * standardDeviation;
    }

    let first = 0;
    let second = 0;
    while (first === 0) first = this.next();
    while (second === 0) second = this.next();
    const magnitude = Math.sqrt(-2 * Math.log(first));
    const firstNormal = magnitude * Math.cos(2 * Math.PI * second);
    this.spareNormal = magnitude * Math.sin(2 * Math.PI * second);
    return mean + firstNormal * standardDeviation;
  }

  pick<T>(values: readonly T[]) {
    if (values.length === 0) throw new Error("Cannot choose from an empty collection.");
    return values[this.integer(0, values.length - 1)];
  }

  shuffle<T>(values: readonly T[]) {
    const shuffled = [...values];
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const replacement = this.integer(0, index);
      [shuffled[index], shuffled[replacement]] = [shuffled[replacement], shuffled[index]];
    }
    return shuffled;
  }

  weightedPick<T>(values: readonly { value: T; weight: number }[]) {
    const totalWeight = values.reduce((total, entry) => total + Math.max(0, entry.weight), 0);
    if (totalWeight <= 0) throw new Error("At least one weighted choice must have positive weight.");
    let threshold = this.next() * totalWeight;
    for (const entry of values) {
      threshold -= Math.max(0, entry.weight);
      if (threshold <= 0) return entry.value;
    }
    return values[values.length - 1].value;
  }

  fork(label: string) {
    return new SeededRandom(`${this.seed}:${label}`);
  }
}

