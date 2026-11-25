// All text shown to the player lives here, so the game is easy to translate later.
export const strings = {
  play: "▶ Spill",
  pause: "❚❚ Pause",
  newDish: "Ny skål",
  speed: (n: number) => `${n}× fart`,
  stats: (s: { seconds: number; organisms: number; cells: number; seed: number }) =>
    `${s.seconds} s · ${s.organisms} organismer · ${s.cells} celler · seed ${s.seed}`,
};
