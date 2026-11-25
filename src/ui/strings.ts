// All text shown to the player lives here, so the game is easy to translate later.
export const strings = {
  play: "▶ Spill",
  pause: "❚❚ Pause",
  newDish: "Ny skål",
  speed: (n: number) => `${n}× fart`,
  stats: (s: { seconds: number; cells: number; food: number; seed: number }) =>
    `Tid ${s.seconds} s · Celler ${s.cells} · Mat ${s.food} · Seed ${s.seed}`,
};
