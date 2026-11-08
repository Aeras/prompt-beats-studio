import { normalizeFootballTeamName as f } from "@/lib/football-team-names.shared";
for (const s of ["Prediction – 08/11/2026", "08/11/26 - 19:45", "on Sunday, 8 November, with", "Monday's football game between Fiorentina and Juventus"]) console.log(JSON.stringify(f(s)));
