import art1 from "@/assets/art-1.jpg";
import art2 from "@/assets/art-2.jpg";
import art3 from "@/assets/art-3.jpg";
import art4 from "@/assets/art-4.jpg";

export type Track = {
  id: string;
  title: string;
  handle: string;
  genre: string;
  art: string;
  duration: string;
  plays: string;
  prompt: string;
  lyrics: string;
  audioUrl?: string;
};

export const GENRES = [
  "All",
  "Reggaeton",
  "Cumbia",
  "Italo Disco",
  "Synthwave",
  "Acoustic",
  "Hip-Hop",
];

export const TRACKS: Track[] = [
  {
    id: "1",
    title: "Perreo Nocturno",
    handle: "@lunabeats",
    genre: "Reggaeton",
    art: art2,
    duration: "3:12",
    plays: "128k",
    prompt:
      "dembow reggaeton, 96 bpm, saturated 808 sub, dry clave percussion, breathy female hook, humid night-club reverb",
    lyrics:
      "[Intro]\nLuces bajas, humo azul\n\n[Verse]\nCamino lento por la avenida\nel bajo empuja y no se olvida",
  },
  {
    id: "2",
    title: "Neon Cassette",
    handle: "@vhs.ghost",
    genre: "Synthwave",
    art: art3,
    duration: "4:05",
    plays: "94k",
    prompt:
      "synthwave, 112 bpm, analog Juno pads, gated reverb snare, arpeggiated bassline, tape hiss, midnight highway energy",
    lyrics:
      "[Intro]\nStatic on the dashboard glow\n\n[Chorus]\nRun the tape until it burns\nCity lights in slow returns",
  },
  {
    id: "3",
    title: "Amanecer Cumbia",
    handle: "@barrio.sonoro",
    genre: "Cumbia",
    art: art1,
    duration: "3:48",
    plays: "61k",
    prompt:
      "digital cumbia, 92 bpm, guacharaca groove, accordion lead, dubby delay throws, warm analog master",
    lyrics: "[Verse]\nSale el sol sobre el mercado\n\n[Chorus]\nBaila, que la noche ya pasó",
  },
  {
    id: "4",
    title: "Velvet Automatic",
    handle: "@disco.milano",
    genre: "Italo Disco",
    art: art4,
    duration: "5:21",
    plays: "212k",
    prompt:
      "italo disco, 122 bpm, octave bass sequencer, glassy DX7 bells, vocoder backing vocals, 1983 Milan nightclub",
    lyrics: "[Intro]\nAutomatic, velvet heart\n\n[Drop]\nDance until the circuits part",
  },
  {
    id: "5",
    title: "Paper Rooms",
    handle: "@sofiawrites",
    genre: "Acoustic",
    art: art1,
    duration: "2:57",
    plays: "38k",
    prompt:
      "intimate acoustic folk, 78 bpm, nylon string guitar, close-mic vocal, room noise, subtle upright bass",
    lyrics: "[Verse]\nPaper rooms and coffee rings\n\n[Outro]\nQuiet is a kind of song",
  },
  {
    id: "6",
    title: "Concrete Halo",
    handle: "@kd.raw",
    genre: "Hip-Hop",
    art: art4,
    duration: "3:33",
    plays: "156k",
    prompt:
      "boom bap hip-hop, 88 bpm, dusty vinyl drums, minor key rhodes loop, gritty male flow, MPC swing",
    lyrics: "[Verse]\nHalo made of concrete dust\n\n[Chorus]\nStill shining out of spite",
  },
];

export const STUDIO_TAGS = ["[Intro]", "[Verse]", "[Pre]", "[Chorus]", "[Drop]", "[Bridge]", "[Outro]"];
