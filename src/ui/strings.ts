// All text shown to the player lives here, so the game is easy to translate later.
export const strings = {
  play: "▶ Spill",
  pause: "❚❚ Pause",
  newDish: "Ny skål",
  organism: "Organisme",
  speed: (n: number) => `${n}× fart`,
  stats: (s: { seconds: number; organisms: number; cells: number; seed: number }) =>
    `${s.seconds} s · ${s.organisms} organismer · ${s.cells} celler · seed ${s.seed}`,
  bench: {
    title: "Morphogen – ytelsestest",
    intro: "Måler hvor raskt simuleringen går på denne enheten. Tar et halvt minutt.",
    start: "Start testen",
    running: "Måler …",
    cells: "Celler",
    msPerTick: "ms per steg",
    maxSpeed: "Maks fart",
    verdictGood: (cells: number, speed: number) =>
      `Med ${cells} celler klarer denne enheten omtrent ${speed}× fart. Bra!`,
    verdictSlow: (cells: number) =>
      `Med ${cells} celler klarer ikke denne enheten full fart. Spillet går saktere, men fryser ikke.`,
    hashTitle: "Fingeravtrykk",
    hashMatch: "Stemmer med fasit – denne enheten regner nøyaktig likt som alle andre.",
    hashMismatch: "Stemmer IKKE med fasit. Send dette til utvikleren:",
    back: "Tilbake til spillet",
  },
};
