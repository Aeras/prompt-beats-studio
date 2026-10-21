/** Immutable authored briefs; never generated or edited by a model. */
export const BRIEFS = [
  {
    id: "ru-pop",
    theme: "Счастье в обычном совместном воскресном утре: чай, дождь и близкий человек рядом.",
    genre: "Russian melodic pop; 104 BPM; relaxed straight groove",
    mood: "Warm, intimate, quietly joyful",
    production: "Conversational female vocal, piano, restrained drums; open melodic chorus",
    instructions:
      "Естественный современный русский язык. В припеве нужна слышимая концевая рифма без заданной схемы. Не искажай ударения, грамматику или порядок слов ради рифмы. Развитие сюжета не требуется.",
  },
  {
    id: "ru-ballad",
    theme:
      "Тихая благодарность человеку, который остаётся рядом в трудный вечер, без драматического поворота.",
    genre: "Russian melodic piano ballad; 76 BPM; spacious 4/4",
    mood: "Tender, sincere, reflective",
    production: "Warm male vocal, piano, soft strings; room for held notes and breaths",
    instructions:
      "Припев: четыре строки с концевой рифмовкой ABAB. Соблюдай естественные русские ударения и грамматику; рифма должна быть слышимой, а не только похожей на письме. Не используй пустые строки ради рифмы. История с развитием не обязательна.",
  },
  {
    id: "ru-hook",
    theme:
      "Домашнее спокойствие рядом с любимым человеком, маленькие бытовые детали вместо громких обещаний.",
    genre: "Russian contemporary pop; 96 BPM; light syncopated groove",
    mood: "Affectionate, relaxed, hopeful",
    production: "Conversational verses, memorable melodic hook, soft bass and clean guitar",
    instructions:
      "Разговорные куплеты, запоминающийся припев с хуком «Вот оно, счастье». Сохрани хук в финальном припеве. Нужны естественные музыкальные созвучия без вымученной рифмы. Не добавляй обязательную сюжетную арку, конфликт или развязку.",
  },
] as const;

export function briefInput(brief: (typeof BRIEFS)[number]) {
  return {
    theme: brief.theme,
    genre: brief.genre,
    mood: brief.mood,
    production: brief.production,
    instructions: brief.instructions,
    language: "Russian",
    targetPlatform: "suno",
    structure: "Verse → Chorus → Verse → Final Chorus",
    songBlueprint: [
      {
        structureIndex: 1,
        sectionType: "Chorus",
        occurrence: 1,
        instruction: "Четыре спетые строки; ясный мелодический хук.",
      },
      {
        structureIndex: 3,
        sectionType: "Final Chorus",
        occurrence: 1,
        instruction: "Четыре спетые строки; сохрани узнаваемый хук первого припева.",
      },
    ],
    operation: "generate",
    promptVersion: "v3",
    inputSnapshot: { generatorMode: "advanced" },
  };
}
