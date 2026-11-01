// The first open's photos (design/stage/HANDOVER_first_open.md). All
// LevelUp's own, from leveluplearning.in and forgebylevelup.com; never stock
// or generated. Bundled in public/brand so the first screen never waits on
// the catalogue or a slow network.

export interface WallPhoto {
  /** file name in public/brand/wall, without .jpg */
  n: string;
  w: number;
  h: number;
  /** where it was taken; the toast on tap and the accessible label */
  cap: string;
}

const W = (n: string, w: number, h: number, cap: string): WallPhoto => ({ n, w, h, cap });

/** The wall, in the mockup's order. Photo k goes in column k mod (column count). */
export const WALL: WallPhoto[] = [
  W("w-forge-filmmaking-7", 360, 539, "Hands-on camera work · Forge Filmmaking Bootcamp"),
  W("w-forge-creators-6", 360, 240, "Vlogging in Ubud · Forge Creator Residency"),
  W("m-lokesh", 600, 750, "Lokesh Kanagaraj · Masterclass"),
  W("w-forge-writing-4", 360, 640, "Writing outdoors · Forge Writing Retreat"),
  W("w-lul-community-5", 360, 216, "Campfire circle · LevelUp community"),
  W("m-ravi", 600, 750, "Ravi Basrur · Masterclass"),
  W("w-forge-creators-5", 360, 540, "Lighting workshop · Forge Creator Residency"),
  W("w-forge-filmmaking-8", 360, 240, "Outdoor shoot · Forge Filmmaking Bootcamp"),
  W("w-forge-ai-bts-1", 360, 202, "Night build · Forge AI Residency"),
  W("m-anthony", 600, 750, "Anthony Gonsalvez · Masterclass"),
  W("w-forge-writing-3", 360, 202, "Whiteboard session · Forge Writing Retreat"),
  W("w-lul-hero-poster-2", 360, 202, "On set · the Forge"),
  W("w-forge-filmmaking-5", 360, 540, "Lighting setup · Forge Filmmaking Bootcamp"),
  W("w-lul-community-8", 360, 270, "Learning together · LevelUp community"),
  W("m-venket", 600, 750, "G Venket Ram · Masterclass"),
  W("w-forge-creators-1", 360, 240, "Recording session · Forge Creator Residency"),
  W("w-forge-writing-8", 360, 539, "Sunset session · Forge Writing Retreat"),
  W("f-editing", 900, 563, "Video Editing Academy · trailer"),
  W("w-forge-cinema-cameras", 360, 539, "Camera work · the Forge"),
  W("w-lul-community-13", 360, 240, "Mentoring session · LevelUp community"),
  W("m-nelson", 600, 750, "Nelson Dilipkumar · Masterclass"),
  W("w-forge-creators-8", 360, 480, "Forge Creator Residency"),
  W("w-forge-creator-tech", 360, 540, "Lighting · the Forge"),
  W("w-lul-forge-filmmaking-banner", 360, 240, "Forge Filmmaking Bootcamp"),
  W("f-music", 900, 562, "Ravi Basrur · Masterclass"),
  W("w-forge-writing-2", 360, 640, "Forge Writing Retreat"),
  W("w-lul-community-4", 360, 240, "Hilltop · LevelUp community"),
  W("m-karthik", 600, 750, "Karthik Subbaraj · Masterclass"),
  W("w-forge-creators-4", 360, 240, "Outdoor mentoring · Forge Creator Residency"),
  W("f-photo", 900, 562, "G Venket Ram · Masterclass"),
  W("w-forge-ai-residency-4", 360, 360, "Forge AI Residency"),
  W("w-forge-writing-7", 360, 240, "Outdoor workshop · Forge Writing Retreat"),
  W("w-lul-community-6", 360, 354, "Bonfire · LevelUp community"),
  W("w-forge-filmmaking-6", 360, 240, "Forge Filmmaking Bootcamp"),
];

export const wallSrc = (p: WallPhoto) => `/brand/wall/${p.n}.jpg`;

/** The 12 intro montage photos, in the handover's grid order (3 across, 4 down). */
export const INTRO_PHOTOS = [
  "01-m-lokesh", "02-w-forge-filmmaking-7", "03-m-ravi",
  "04-w-forge-writing-4", "05-w-forge-cinema-cameras", "06-m-venket",
  "07-m-anthony", "08-w-forge-creators-5", "09-w-forge-filmmaking-5",
  "10-w-forge-creator-tech", "11-m-nelson", "12-m-karthik",
].map((n) => `/brand/intro/${n}.jpg`);
