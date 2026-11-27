import { LIFE_PER_DAY } from "./dims";
import type { FormKind } from "./forms";

export interface PlantSpecies {
  name: string;
  form: FormKind;
  /** Growth steps to full size, and life steps with water per growth step. */
  full: number;
  growEvery: number;
  /** How deep its roots reach below its foot, as a seedling and full grown (rows). */
  reach: [number, number];
  /** Life steps it lives. */
  life: number;
  /** About how often, full grown, it drops a dead leaf and a seed (life steps). */
  leafEvery: number;
  seedEvery: number;
  /** Must its seed lie in a little pit to sprout? Grass sprouts anywhere. */
  pit: boolean;
  colors: { leaf: string; stem: string; petal: string; center: string; seed: string };
}

const DAY = LIFE_PER_DAY;

export const PLANTS: PlantSpecies[] = [
  {
    name: "Gress",
    form: "grass",
    full: 8,
    growEvery: DAY / 4,
    reach: [12, 20],
    life: 20 * DAY,
    leafEvery: 48,
    seedEvery: DAY / 2,
    pit: false,
    colors: { leaf: "#4f8a3a", stem: "#3f6e32", petal: "#c9b46a", center: "#c9b46a", seed: "#a08c48" },
  },
  {
    name: "Blomst",
    form: "flower",
    full: 12,
    growEvery: DAY / 3,
    reach: [14, 26],
    life: 16 * DAY,
    leafEvery: 24,
    seedEvery: DAY / 3,
    pit: true,
    colors: { leaf: "#4a7c3a", stem: "#3a6a32", petal: "#e7a0b0", center: "#ffd84a", seed: "#b8894a" },
  },
  {
    name: "Busk",
    form: "bush",
    full: 20,
    growEvery: DAY / 2,
    reach: [16, 34],
    life: 60 * DAY,
    leafEvery: 8,
    seedEvery: DAY / 2,
    pit: true,
    colors: { leaf: "#4f7c3e", stem: "#4a3428", petal: "#c97a8a", center: "#c97a8a", seed: "#8a5a3a" },
  },
];

export const SKRUKKETROLL = { name: "Skrukketroll", color: "#8c8e96" };
