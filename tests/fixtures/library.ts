import type { Library } from "../../src/lib/messageLibrary";

/** A small library shared by the message tests: out of order on purpose, with an empty section and an orphan. */
export const library: Library = {
  sections: [
    { id: 2, name: "Welcoming Ambience Jewel", sort: 1, inService: true },
    { id: 1, name: "Apologies", sort: 0, inService: false },
    { id: 3, name: "Empty", sort: 2, inService: true },
  ],
  messages: [
    { id: 11, sectionId: 2, title: "Sunday · Worship", parts: ["Arms wide, hearts bowed"], sort: 1 },
    { id: 10, sectionId: 2, title: "Sunday", parts: ["As we gather to honour"], sort: 0 },
    { id: 20, sectionId: 1, title: "Sound restored", parts: ["Sirs and Mas, we apologize for the interruption. The sound has been restored."], sort: 0 },
    { id: 99, sectionId: 42, title: "Orphan", parts: ["no section"], sort: 0 },
  ],
};
