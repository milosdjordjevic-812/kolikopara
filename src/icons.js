// Ikonice crtane istom linijom kao novčanik: tanka linija, bez ispune.
const P = {
  pregled: "M4 20V11M10 20V5M16 20v-8M3 20h18",
  stavke: "M9 6h11M9 12h11M9 18h11M4 6h1.5M4 12h1.5M4 18h1.5",
  prolazno: "M4 8h15l-3.5-3.5M20 16H5l3.5 3.5",
  vise: "M3.9 12a1.1 1.1 0 1 0 2.2 0 1.1 1.1 0 1 0-2.2 0zM10.9 12a1.1 1.1 0 1 0 2.2 0 1.1 1.1 0 1 0-2.2 0zM17.9 12a1.1 1.1 0 1 0 2.2 0 1.1 1.1 0 1 0-2.2 0z",
  scan: "M3 8V4h4M17 4h4v4M21 16v4h-4M7 20H3v-4M7 12h10",
  market: "M3 9h18l-2 11H5L3 9zM8 9l4-5 4 5M9 13v4M15 13v4",
  dostava: "M5 8h14l-1 12H6L5 8zM9 8V6.5a3 3 0 0 1 6 0V8",
  izlasci: "M5 8h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5V8zM16 10h1.5a2 2 0 0 1 0 4H16M8 3v2.5M11.5 3v2.5M4 21h13",
  cigarete: "M3 14h15v3H3zM15 14v3M20.5 14v3M18 11c0-2 2-2 2-4M21 11c0-1.5 1-2 1-3.5",
  alkohol: "M8 3h8l-.8 6.5a3.2 3.2 0 0 1-6.4 0L8 3zM12 12.6V21M8.5 21h7M8.3 6h7.4",
  gorivo: "M4 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M3 21h12M6.5 7h5v4h-5zM14 9h2a2 2 0 0 1 2 2v5a1.5 1.5 0 0 0 3 0V8l-3-3",
  pumpa: "M4 10v10h16V10M3 10l2-6h14l2 6H3zM10 20v-5h4v5",
  putarina: "M8 3L4 21M16 3l4 18M12 5v2.5M12 11v2.5M12 17v2.5",
  taksi: "M5 13l2-5h10l2 5M3 13h18v5H3zM6 18v2.5M18 18v2.5M5.9 15.5a1.1 1.1 0 1 0 2.2 0 1.1 1.1 0 1 0-2.2 0zM15.9 15.5a1.1 1.1 0 1 0 2.2 0 1.1 1.1 0 1 0-2.2 0zM10 5h4",
  pretplate: "M4.5 11a7.5 7.5 0 0 1 13.4-4.2L20 9M20 4v5h-5M19.5 13a7.5 7.5 0 0 1-13.4 4.2L4 15M4 20v-5h5",
  racuni: "M6 3h12v18l-3-2-3 2-3-2-3 2V3zM9 8h6M9 12h6M9 16h3",
  apoteka: "M10 4h4v6h6v4h-6v6h-4v-6H4v-4h6z",
  kupovina: "M3 8l9-5 9 5v8l-9 5-9-5V8zM3 8l9 5 9-5M12 13v8M7.5 5.5l9 5",
  gotovina: "M3 7h18v10H3zM14.5 12a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0zM6 10v4M18 10v4",
  provizije: "M3 9l9-5 9 5H3zM5.5 9v8M10 9v8M14 9v8M18.5 9v8M3 20h18",
  ostalo: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0zM6.9 12a1.1 1.1 0 1 0 2.2 0 1.1 1.1 0 1 0-2.2 0zM10.9 12a1.1 1.1 0 1 0 2.2 0 1.1 1.1 0 1 0-2.2 0zM14.9 12a1.1 1.1 0 1 0 2.2 0 1.1 1.1 0 1 0-2.2 0z",
  nerazvrstano: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0zM9.5 9.5a2.5 2.5 0 1 1 3.4 2.3c-.6.3-.9.8-.9 1.5V14M10.9 17.2a1.1 1.1 0 1 0 2.2 0 1.1 1.1 0 1 0-2.2 0z",
  interno: "M7 20V4M4 7l3-3 3 3M17 4v16M14 17l3 3 3-3",
  priliv: "M12 3v12M7 10l5 5 5-5M4 16v4h16v-4",
  sun: "M12 7.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9zM12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8",
  phone: "M7 2.5h10v19H7zM11 18.5h2",
  moon: "M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z",
};
P.prolazno_cat = P.prolazno;

export function icon(name, size = 20, cls = "ic") {
  const d = P[name] || P.ostalo;
  return `<svg class="${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
}
export const catIcon = (id, size) => icon(id === "prolazno" ? "prolazno_cat" : id, size);
