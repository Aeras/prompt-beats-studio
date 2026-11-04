/** Presentation labels only; never used in evidence verification or persistence. */
const GREEK: Record<string, string> = {
  arsenal: "Άρσεναλ",
  "aston villa": "Άστον Βίλα",
  "afc bournemouth": "Μπόρνμουθ",
  brentford: "Μπρέντφορντ",
  "brighton & hove albion": "Μπράιτον",
  chelsea: "Τσέλσι",
  "crystal palace": "Κρίσταλ Πάλας",
  everton: "Έβερτον",
  fulham: "Φούλαμ",
  "leeds united": "Λιντς",
  liverpool: "Λίβερπουλ",
  "manchester city": "Μάντσεστερ Σίτι",
  "manchester united": "Μάντσεστερ Γιουνάιτεντ",
  "newcastle united": "Νιούκασλ",
  "nottingham forest": "Νότιγχαμ Φόρεστ",
  sunderland: "Σάντερλαντ",
  "tottenham hotspur": "Τότεναμ",
  "west ham united": "Γουέστ Χαμ",
  "wolverhampton wanderers": "Γουλβς",
  "ipswich town": "Ίπσουιτς",
  "hull city": "Χαλ Σίτι",
  "coventry city": "Κόβεντρι",
};
export function footballTeamDisplayName(name: string, language: string): string {
  if (language !== "el") return name;
  return GREEK[name.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en")] ?? name;
}
