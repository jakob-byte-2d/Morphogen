/** All text the player sees. Norwegian for now. */
export const t = {
  title: "Morphogen",
  glass: "Terrariet. Dra med én finger for å bruke verktøyet, klyp for å zoome, dobbelttrykk for å zoome inn og ut.",
  tools: "Verktøy",
  seeds: "Velg frø",
  tool: {
    water: "Vann",
    soil: "Jord",
    seed: "Frø",
    creature: "Kryp",
    feed: "Fôr",
    spade: "Spade",
  } as Record<string, string>,
  dev: {
    pause: "Pause",
    play: "Spill",
    step: "Ett steg",
    max: "maks",
    info: (tick: number, fps: number, ms: number, tps: number) =>
      `steg ${tick} · ${fps} fps · ${ms.toFixed(2)} ms/steg · ${tps} steg/s`,
  },
};
