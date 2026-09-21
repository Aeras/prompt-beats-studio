import { createFileRoute, Link } from "@tanstack/react-router";
import {
  BookOpen,
  CheckCircle2,
  CircleHelp,
  Download,
  FolderOpen,
  Heart,
  Languages,
  ListMusic,
  MessageSquareWarning,
  Music2,
  Save,
  Share2,
  Sparkles,
  Upload,
  UserRound,
  Wand2,
} from "lucide-react";

import { AppShell } from "@/components/promptbeats/AppShell";
import { useI18n } from "@/i18n";

export const Route = createFileRoute("/help")({
  head: () => ({
    meta: [
      { title: "Help | PromptBeats" },
      {
        name: "description",
        content: "PromptBeats user guide for AI Generator, Projects, saved Prompts, Lyrics Workspace, publishing and social features.",
      },
    ],
  }),
  component: HelpPage,
});

type HelpSection = {
  id: string;
  title: string;
  intro: string;
  steps: string[];
  note?: string;
};

const englishSections: HelpSection[] = [
  {
    id: "getting-started",
    title: "1. Getting started",
    intro:
      "PromptBeats brings creation, revision, organization and publishing tools into one workspace. The main navigation gives you access to Discover, Trending, the Generator/Studio and your Library.",
    steps: [
      "Use Discover to browse public tracks and creators.",
      "Use Trending to see content surfaced by the platform's current ranking system.",
      "Open Studio / Generator when you want to create or revise a song setup.",
      "Open Library to manage saved Prompts, Projects, analyses, playlists and your own tracks.",
      "Use the language control to switch the interface between English and Greek.",
    ],
    note:
      "Some features are controlled by PromptBeats Feature Access. If a feature is not currently available to your account, it may not appear in the interface.",
  },
  {
    id: "generator-basic",
    title: "2. AI Generator — Basic mode",
    intro:
      "Basic mode is the fastest way to turn a song idea into a structured result without configuring every production detail yourself.",
    steps: [
      "Choose Basic mode.",
      "Describe the Theme — what the song is about, the story, situation or central idea.",
      "Choose a Music Style.",
      "Choose the Mood / Vibe.",
      "Choose the lyrics Language. When a language offers a supported regional or language variant, you can select it separately.",
      "Press Generate. PromptBeats sends the structured request to the selected AI model and returns the generated song material.",
      "Review the result before saving, revising or using it with an external music-generation platform.",
    ],
    note:
      "If you leave the tab, refresh or temporarily lose focus while a generation is running, PromptBeats keeps the active job reference and can recover the result or failure state when you return.",
  },
  {
    id: "generator-advanced",
    title: "3. AI Generator — Advanced mode",
    intro:
      "Advanced mode is for users who want detailed control over the musical and production brief before generation.",
    steps: [
      "Choose Advanced mode.",
      "Complete any combination of Theme, Music Style, Mood, Instruments, BPM, Song Structure, Production Style, Additional Instructions and Language.",
      "Use the individual clear controls to remove the value of a specific section when needed.",
      "Use the main Clear / Reset action when you want to clear the whole setup and return the configurable sections to their initial state.",
      "Choose the target AI music platform when that option is available. PromptBeats adapts the generated instructions to the selected target.",
      "Generate only after reviewing the brief. Advanced mode is designed to give the AI more precise musical context than Basic mode.",
    ],
    note:
      "Advanced mode does not require every optional field. Add detail where it helps your idea; avoid filling fields only for the sake of filling them.",
  },
  {
    id: "setup-assistant",
    title: "4. Song Setup Assistant",
    intro:
      "The Song Setup Assistant lets you describe the song in ordinary language and converts that description into a complete Advanced-mode setup. It prepares the settings; it does not write the final song at this stage.",
    steps: [
      "Open Song Setup Assistant from the Generator.",
      "Write a natural-language description of the song you want. You can describe story, style, atmosphere, instruments, tempo, cultural influences, production ideas and anything else that matters.",
      "Press Generate Setup.",
      "Review the generated Advanced setup. The assistant fills Theme, Music Style, Mood, Instruments, BPM, Song Structure, Production Style, Additional Instructions and Language.",
      "Edit any generated field directly in the preview if you want to change it.",
      "Use Regenerate Setup if you want a different interpretation of the same description.",
      "Press Apply to Advanced to transfer the setup into the Advanced Generator, then review it once more before generating the song.",
    ],
    note:
      "The assistant currently accepts a description of up to 2,500 characters and is intended to save setup time, not replace your own creative judgment.",
  },
  {
    id: "smart-presets",
    title: "5. Smart Presets and Cultural Style",
    intro:
      "Smart Presets provide ready-made musical starting points that can populate or shape Advanced-mode settings.",
    steps: [
      "Open Smart Presets inside Advanced mode.",
      "Browse all presets or filter them by category such as Pop, Rock, Electronic, Hip-Hop, Acoustic or Global.",
      "Use search when you already know the kind of sound you want.",
      "Apply a preset to transfer its musical fingerprint into the Generator.",
      "For Local Folk / Popular-style presets, choose a Cultural Region and Cultural Style when available.",
      "Treat Cultural Style and lyrics Language as separate choices. For example, you can use a Greek musical identity with English lyrics.",
      "After applying a preset, freely edit the fields. A preset is a starting point, not a locked template.",
    ],
  },
  {
    id: "structure-blueprint",
    title: "6. Song Structure and Song Blueprint",
    intro:
      "Advanced mode can define not only which sections the song contains, but also what should happen inside each occurrence of those sections.",
    steps: [
      "Build the Song Structure using sections such as Intro, Verse, Pre-Chorus, Chorus, Bridge, Breakdown, Solo or Outro, depending on the song.",
      "Reorder or adjust the structure until it reflects the intended flow.",
      "Use Song Blueprint directions to describe arrangement, energy, vocals or production behavior for specific section occurrences.",
      "Repeated sections can be treated as separate occurrences, so a later Chorus can intentionally grow or change compared with an earlier Chorus.",
      "Where the interface offers Apply to All for a repeated section such as Chorus, use it when the same direction should be copied to every occurrence.",
    ],
    note:
      "Blueprint directions are instructions for the musical result. They do not replace the lyrics themselves.",
  },
  {
    id: "generator-results",
    title: "7. Working with Generator results",
    intro:
      "After generation, PromptBeats presents the result in editable sections so you can inspect and refine it before saving.",
    steps: [
      "Review the generated Song Title, style/tags, Lyrics / Structure and Producer Note.",
      "Expand or collapse result sections as needed.",
      "Edit result text directly when you want to make a manual change.",
      "Open Lyrics Workspace when you want section-by-section lyric editing rather than editing the entire lyric block at once.",
      "Run Quality Check when you want an automated review of the generated material.",
      "Save the result to your Library either as a standalone Prompt or inside a Project.",
    ],
  },
  {
    id: "quality-check",
    title: "8. Quality Check",
    intro:
      "Quality Check evaluates the generated lyrics and creative brief. It is an automated review tool, not an objective artistic verdict or legal copyright check.",
    steps: [
      "Run Quality Check from a generated result.",
      "Review the Passed / Failed status and the score out of 10.",
      "Read the detected issues. The check can evaluate language quality, grammar, coherence, singability, cadence, rhyme, phrasing, genre/brief consistency and related songwriting factors.",
      "Review suggested corrections and improvement suggestions individually rather than applying them blindly.",
      "Where correction actions are available, use Apply and Undo to compare the proposed change with the original.",
      "Run the check again after meaningful revisions if you want an updated assessment.",
    ],
    note:
      "A Passed result is not a guarantee of originality, legal clearance or commercial success. A Failed result does not mean the song is artistically invalid.",
  },
  {
    id: "saved-prompts",
    title: "9. Saved Prompts",
    intro:
      "A saved Prompt is a stored Generator result that you can return to later instead of losing the creative setup after the current session.",
    steps: [
      "After a generation, choose Save Prompt.",
      "Give the Prompt a useful name.",
      "You can save it without a Project when it is a standalone idea.",
      "From Library, search and reopen saved Prompts.",
      "Use Revise when you want to create a new AI-generated version from an existing saved Prompt.",
      "Use Edit Lyrics when you want to work on the lyrics section by section in Lyrics Workspace.",
      "Use Export when you want a local copy in TXT, Markdown, HTML or JSON.",
    ],
  },
  {
    id: "projects",
    title: "10. Projects and automatic versions",
    intro:
      "Projects group multiple versions of the same song idea. They are designed for iterative songwriting rather than forcing you to overwrite the previous result.",
    steps: [
      "When saving a Prompt, choose an existing Project or create a new Project.",
      "The first Prompt stored in a Project receives the next available version number automatically, beginning with V1 for a new Project.",
      "You may add an optional version label such as “More Guitar”, “New Chorus” or “Radio Edit”.",
      "Every later saved revision in the same Project receives the next version number automatically: V2, V3, V4 and so on.",
      "Earlier versions remain available, so you can compare the evolution of the song instead of replacing the old version.",
      "Use the Project view in Library to keep the song's versions and creation history together.",
    ],
    note:
      "Version numbering is assigned by the backend for the Project, which prevents two versions from accidentally receiving the same number.",
  },
  {
    id: "project-revision",
    title: "11. Project Revision",
    intro:
      "Project Revision creates a new version from a saved Project version while preserving the original.",
    steps: [
      "Choose Project Revision in the Generator or use Revise from a saved Prompt.",
      "Select the Project.",
      "Select the Base version you want to revise, for example V2 rather than always starting from the latest version.",
      "Write the revision request — for example, change the Chorus, make the production darker, reduce the tempo, or keep the verses but rewrite the hook.",
      "Adjust the current Generator settings if you also want to change the desired musical setup.",
      "Generate the revision.",
      "The new result is saved automatically as the next version in the same Project rather than overwriting the selected base version.",
    ],
  },
  {
    id: "lyrics-workspace",
    title: "12. Lyrics Workspace — section-by-section editing",
    intro:
      "Lyrics Workspace is designed for focused lyric revision. Instead of asking the AI to rewrite an entire song, you can work on individual sections while protecting the parts you want to keep.",
    steps: [
      "Open Lyrics Workspace from a generated result or from Edit Lyrics in Library.",
      "Review the song split into sections such as Verse, Chorus, Bridge and other detected sections.",
      "Lock a section when you do not want it changed while you work elsewhere.",
      "Choose AI Edit for the section you want to improve.",
      "Give a custom instruction describing exactly what should change in that section.",
      "Review the AI proposal before applying it. When multiple proposals are returned, choose the one you prefer.",
      "Apply the selected proposal only to that section.",
      "Use Undo to revert the last applied AI edit for a section when needed.",
      "When you are satisfied, use Save as New Version. If the source belongs to a Project, the edited lyrics are saved as the next Project version instead of overwriting the previous one.",
    ],
    note:
      "Section-level editing is especially useful when a Chorus already works and only one Verse needs to be rewritten.",
  },
  {
    id: "export",
    title: "13. Export Center",
    intro:
      "Export Center lets you keep local copies of your Prompt or an entire Project outside PromptBeats.",
    steps: [
      "Open Export from a saved Prompt or Project.",
      "Choose TXT, Markdown, HTML or JSON.",
      "For a single Prompt, PromptBeats creates one file containing the saved Prompt information.",
      "For a Project, choose Entire Project — one file to export the Project, Creation Notes and all versions together.",
      "Alternatively choose Project + Prompts — separate files to receive a ZIP containing one summary and one file for each version.",
    ],
  },
  {
    id: "upload-publish",
    title: "14. Adding and publishing tracks",
    intro:
      "PromptBeats can store tracks uploaded directly by you and can also reference supported external tracks such as Suno or Udio links.",
    steps: [
      "Open the track submission / Studio interface.",
      "Choose the audio source: direct upload, Suno or Udio where available.",
      "For a direct upload, choose the audio file and optional cover artwork, then identify the platform or tool the track was created with when requested.",
      "For Suno or Udio, paste a valid supported track link.",
      "Choose whether the track is Public or Private.",
      "Mark the track Explicit when the lyrics contain strong or explicit language that should be disclosed to listeners.",
      "For uploaded audio, choose whether other signed-in users are allowed to download the file.",
      "Complete the title, genre and any other available track information, then save or publish.",
    ],
  },
  {
    id: "track-controls",
    title: "15. Editing your tracks and content visibility",
    intro:
      "Track owners can update the information and visibility of their own tracks after they have been saved.",
    steps: [
      "Open Edit on one of your own tracks.",
      "Change the title, genre and other editable metadata.",
      "Switch the track itself between Public and Private.",
      "Control Prompt visibility separately from Lyrics visibility where those fields are present.",
      "For direct uploads, you can change the Allow Download setting.",
      "Update the Explicit label when appropriate.",
      "For uploaded tracks, replacement audio and replacement cover artwork can be provided where the feature is available.",
      "Use Delete only when you intend to permanently remove the track.",
    ],
  },
  {
    id: "library-social",
    title: "16. Library, Favorites, Likes and Playlists",
    intro:
      "Library is the main place for organizing your own creative material and the music you want to keep close at hand.",
    steps: [
      "Use the saved-Prompt area for your Generator work and Projects.",
      "Use Favorites to keep tracks you want to find again quickly.",
      "Use Like to show engagement with a public track where the feature is available.",
      "Create playlists and add tracks to them to organize music into collections.",
      "Switch supported Library views when you prefer a standard, compact or list-style layout.",
      "Remember that adding a track to Favorites or a playlist does not transfer any rights in that track.",
    ],
  },
  {
    id: "follow-notifications",
    title: "17. Follow Creators and Notifications",
    intro:
      "PromptBeats includes creator-following and in-app notifications so you can keep up with creators you are interested in.",
    steps: [
      "Open a creator's public profile.",
      "Press Follow to follow that creator; press Following again if you later want to unfollow.",
      "Open the Followers or Following counts to browse the corresponding public creator profiles.",
      "Use the bell icon to open Notifications.",
      "Notifications can include events such as new followers or new tracks from creators you follow, depending on your current notification preferences.",
      "Use the notification settings inside the Notification Center to control supported notification categories.",
      "Mark individual notifications, or all notifications, as read when appropriate.",
    ],
  },
  {
    id: "sharing",
    title: "18. Sharing and Public Links",
    intro:
      "Sharing tools let you provide access to supported content through a link.",
    steps: [
      "Use the available Share / Public Link action for the relevant track or content.",
      "Treat a public or shareable link as something that can be forwarded to other people.",
      "Do not use a public link for content that you intend to remain inaccessible to anyone who receives the link.",
      "Revoking or deleting a link later cannot remove copies, screenshots or downloads already made by other people.",
    ],
  },
  {
    id: "external-media",
    title: "19. Suno and Udio embedded players",
    intro:
      "PromptBeats does not automatically load supported third-party embedded players before you allow external media.",
    steps: [
      "When a Suno or Udio embed is blocked, PromptBeats shows an external-media notice instead of loading the iframe immediately.",
      "Choose Allow external media if you want the third-party player to load.",
      "After permission has been given, supported embeds can load when they come near the visible area of the page.",
      "You can always use the provider link to open the track directly on the external provider where that link is offered.",
    ],
    note:
      "External providers operate under their own terms and privacy practices.",
  },
  {
    id: "profile",
    title: "20. Profile and interface language",
    intro:
      "Your public profile represents you as a creator on PromptBeats.",
    steps: [
      "Edit your profile information from the available profile controls.",
      "Choose your public display information carefully because public profile details can be visible to other users or visitors.",
      "Your public creator page can show public tracks and supported social information.",
      "Use the interface-language selector to switch between English and Greek. PromptBeats remembers your interface preference.",
    ],
  },
  {
    id: "reports",
    title: "21. Reports, moderation cases and appeals",
    intro:
      "Use the reporting system when you believe a track or related content violates PromptBeats rules, rights or applicable law.",
    steps: [
      "Use Report on the relevant track and select the reason that best describes the issue.",
      "Provide enough detail for the report to be understood. Submitting a report does not automatically remove the content.",
      "If further review is required, PromptBeats may open a moderation case and contact the creator through case-based communication.",
      "If you are the affected creator, respond inside the active case when information, clarification or proof of rights is requested.",
      "If an issued decision is eligible for appeal, use Appeal / Request Review and explain why you believe the decision should be reconsidered.",
      "The internal appeal is re-reviewed at Admin level and the final approval is performed by a Super Admin under the current workflow.",
      "For a formal Copyright / IP Notice, use the formal contact channel described in the Copyright / Intellectual Property Policy rather than assuming that a normal in-app Report is the same legal process.",
    ],
  },
  {
    id: "workflow",
    title: "22. A practical PromptBeats workflow",
    intro:
      "There is no single correct way to use PromptBeats, but the following workflow uses the main tools together effectively.",
    steps: [
      "Start in Basic mode for a quick idea, or Advanced mode when you already know the musical direction.",
      "If you only have a rough concept, use Song Setup Assistant to build the Advanced setup for you.",
      "Use Smart Presets and Song Blueprint when you want stronger musical structure and arrangement control.",
      "Generate the song material.",
      "Run Quality Check and review the findings.",
      "Use Lyrics Workspace for targeted section-by-section lyric changes.",
      "Save the result inside a Project so later revisions become V2, V3 and subsequent versions automatically.",
      "Use Project Revision when you want a new AI-generated version while preserving an earlier version.",
      "Export the Prompt or Project when you want an offline copy.",
      "When the final audio exists, upload it or link the supported external source, set visibility and publishing options, and share it through PromptBeats.",
    ],
  },
];

const greekSections: HelpSection[] = [
  {
    id: "getting-started",
    title: "1. Ξεκινώντας",
    intro:
      "Το PromptBeats συγκεντρώνει σε έναν χώρο εργαλεία δημιουργίας, αναθεώρησης, οργάνωσης και δημοσίευσης. Από την κύρια πλοήγηση μεταβαίνεις στο Discover, στο Trending, στον Generator / Studio και στη Library.",
    steps: [
      "Χρησιμοποίησε το Discover για να βλέπεις δημόσια tracks και creators.",
      "Χρησιμοποίησε το Trending για περιεχόμενο που εμφανίζεται από το τρέχον σύστημα κατάταξης της πλατφόρμας.",
      "Άνοιξε το Studio / Generator όταν θέλεις να δημιουργήσεις ή να αναθεωρήσεις ένα τραγούδι.",
      "Άνοιξε τη Library για Saved Prompts, Projects, analyses, playlists και τα δικά σου tracks.",
      "Χρησιμοποίησε την επιλογή γλώσσας για να αλλάζεις το interface μεταξύ Ελληνικών και Αγγλικών.",
    ],
    note:
      "Ορισμένες λειτουργίες ελέγχονται από το Feature Access του PromptBeats. Αν μια λειτουργία δεν είναι διαθέσιμη στον λογαριασμό σου, μπορεί να μην εμφανίζεται στο interface.",
  },
  {
    id: "generator-basic",
    title: "2. AI Generator — Βασική λειτουργία",
    intro:
      "Η Βασική λειτουργία είναι ο γρηγορότερος τρόπος να μετατρέψεις μια ιδέα τραγουδιού σε οργανωμένο αποτέλεσμα χωρίς να ρυθμίσεις μόνος σου κάθε λεπτομέρεια παραγωγής.",
    steps: [
      "Επίλεξε Βασικό.",
      "Συμπλήρωσε το Theme — το θέμα, την ιστορία, την κατάσταση ή την κεντρική ιδέα του τραγουδιού.",
      "Επίλεξε Music Style.",
      "Επίλεξε Mood / Vibe.",
      "Επίλεξε τη γλώσσα των στίχων. Όταν μια γλώσσα διαθέτει υποστηριζόμενη παραλλαγή, μπορείς να την επιλέξεις ξεχωριστά.",
      "Πάτησε Generate. Το PromptBeats στέλνει το οργανωμένο αίτημα στο επιλεγμένο μοντέλο AI και επιστρέφει το δημιουργικό αποτέλεσμα.",
      "Έλεγξε το αποτέλεσμα πριν το αποθηκεύσεις, το αναθεωρήσεις ή το χρησιμοποιήσεις σε εξωτερική πλατφόρμα δημιουργίας μουσικής.",
    ],
    note:
      "Αν αλλάξεις καρτέλα, κάνεις refresh ή φύγεις προσωρινά από τη σελίδα όσο εκτελείται generation, το PromptBeats διατηρεί το ενεργό job και μπορεί να επαναφέρει το αποτέλεσμα ή το error όταν επιστρέψεις.",
  },
  {
    id: "generator-advanced",
    title: "3. AI Generator — Προηγμένη λειτουργία",
    intro:
      "Η Προηγμένη λειτουργία απευθύνεται σε χρήστες που θέλουν λεπτομερή έλεγχο του μουσικού και παραγωγικού brief πριν από τη δημιουργία.",
    steps: [
      "Επίλεξε Προηγμένο.",
      "Συμπλήρωσε όσα από τα Theme, Music Style, Mood, Instruments, BPM, Song Structure, Production Style, Additional Instructions και Language χρειάζεσαι.",
      "Χρησιμοποίησε την επιμέρους καθάριση όταν θέλεις να αδειάσεις μόνο μία συγκεκριμένη ενότητα.",
      "Χρησιμοποίησε το κεντρικό Clear / Reset όταν θέλεις να καθαρίσεις συνολικά το setup και να επιστρέψουν οι ρυθμιζόμενες ενότητες στην αρχική τους κατάσταση.",
      "Επίλεξε target AI music platform όταν η επιλογή είναι διαθέσιμη. Το PromptBeats προσαρμόζει τις οδηγίες στο επιλεγμένο target.",
      "Πριν πατήσεις Generate, έλεγξε συνολικά το brief. Το Advanced υπάρχει για να δίνει στο AI περισσότερο και ακριβέστερο μουσικό context από το Basic.",
    ],
    note:
      "Δεν χρειάζεται να συμπληρώσεις υποχρεωτικά κάθε προαιρετικό πεδίο. Πρόσθεσε λεπτομέρεια εκεί όπου βοηθά πραγματικά το τραγούδι.",
  },
  {
    id: "setup-assistant",
    title: "4. Βοηθός Ρύθμισης Τραγουδιού",
    intro:
      "Ο Song Setup Assistant σου επιτρέπει να περιγράψεις το τραγούδι με απλά λόγια και μετατρέπει την περιγραφή σε πλήρες Advanced setup. Σε αυτό το στάδιο ετοιμάζει τις ρυθμίσεις· δεν γράφει ο ίδιος το τελικό τραγούδι.",
    steps: [
      "Άνοιξε τον Βοηθό Ρύθμισης Τραγουδιού μέσα από τον Generator.",
      "Γράψε φυσιολογικά τι τραγούδι θέλεις. Μπορείς να περιγράψεις ιστορία, είδος, ατμόσφαιρα, όργανα, tempo, πολιτισμικές επιρροές, παραγωγή και οτιδήποτε άλλο θεωρείς σημαντικό.",
      "Πάτησε Δημιουργία ρύθμισης.",
      "Έλεγξε το Advanced setup που δημιουργήθηκε. Ο βοηθός συμπληρώνει Theme, Music Style, Mood, Instruments, BPM, Song Structure, Production Style, Additional Instructions και Language.",
      "Διόρθωσε ελεύθερα οποιοδήποτε από τα πεδία μέσα στην προεπισκόπηση.",
      "Χρησιμοποίησε Νέα δημιουργία αν θέλεις διαφορετική ερμηνεία της ίδιας περιγραφής.",
      "Πάτησε Εφαρμογή στο Προηγμένο για να περάσουν τα πεδία στον Advanced Generator και κάνε έναν τελευταίο έλεγχο πριν από το Generate.",
    ],
    note:
      "Η περιγραφή υποστηρίζει σήμερα έως 2.500 χαρακτήρες. Ο βοηθός έχει σκοπό να γλιτώνει χρόνο στο setup, όχι να αντικαθιστά τη δική σου δημιουργική κρίση.",
  },
  {
    id: "smart-presets",
    title: "5. Smart Presets και Cultural Style",
    intro:
      "Τα Smart Presets είναι έτοιμα μουσικά σημεία εκκίνησης που μπορούν να διαμορφώσουν γρήγορα το Advanced setup.",
    steps: [
      "Άνοιξε τα Smart Presets μέσα από το Advanced.",
      "Δες όλα τα presets ή φιλτράρισέ τα ανά κατηγορία, όπως Pop, Rock, Electronic, Hip-Hop, Acoustic ή Global.",
      "Χρησιμοποίησε την αναζήτηση όταν γνωρίζεις ήδη περίπου τι ήχο ψάχνεις.",
      "Εφάρμοσε ένα preset ώστε να περάσει το μουσικό του fingerprint στον Generator.",
      "Στα Local Folk / Popular presets επίλεξε Cultural Region και Cultural Style, όπου εμφανίζονται.",
      "Το Cultural Style και η γλώσσα των στίχων είναι ανεξάρτητες επιλογές. Μπορείς, για παράδειγμα, να έχεις ελληνική μουσική ταυτότητα με αγγλικούς στίχους.",
      "Μετά την εφαρμογή μπορείς να αλλάξεις όποιο πεδίο θέλεις. Το preset είναι αφετηρία, όχι κλειδωμένο template.",
    ],
  },
  {
    id: "structure-blueprint",
    title: "6. Song Structure και Song Blueprint",
    intro:
      "Στο Advanced μπορείς να ορίσεις όχι μόνο ποιες ενότητες έχει το τραγούδι, αλλά και τι θέλεις να συμβαίνει μέσα σε κάθε εμφάνιση μιας ενότητας.",
    steps: [
      "Χτίσε τη Song Structure με ενότητες όπως Intro, Verse, Pre-Chorus, Chorus, Bridge, Breakdown, Solo ή Outro, ανάλογα με το τραγούδι.",
      "Ρύθμισε τη σειρά μέχρι να αντιστοιχεί στη ροή που θέλεις.",
      "Στο Song Blueprint γράψε οδηγίες ενορχήστρωσης, ενέργειας, φωνητικών ή παραγωγής για συγκεκριμένες εμφανίσεις των ενοτήτων.",
      "Οι επαναλαμβανόμενες ενότητες μπορούν να αντιμετωπίζονται ως διαφορετικές εμφανίσεις, ώστε π.χ. το δεύτερο Chorus να είναι μεγαλύτερο ή διαφορετικό από το πρώτο.",
      "Όπου υπάρχει Εφαρμογή σε όλα για επαναλαμβανόμενη ενότητα όπως Chorus, χρησιμοποίησέ το όταν θέλεις την ίδια οδηγία σε όλες τις εμφανίσεις.",
    ],
    note:
      "Οι Blueprint οδηγίες αφορούν την εκτέλεση και παραγωγή της ενότητας. Δεν αντικαθιστούν τους ίδιους τους στίχους.",
  },
  {
    id: "generator-results",
    title: "7. Εργασία με το αποτέλεσμα του Generator",
    intro:
      "Μετά το generation, το PromptBeats εμφανίζει το αποτέλεσμα σε ξεχωριστές επεξεργάσιμες ενότητες, ώστε να το ελέγξεις πριν το αποθηκεύσεις.",
    steps: [
      "Έλεγξε Song Title, style/tags, Lyrics / Structure και Producer Note.",
      "Άνοιξε ή σύμπτυξε τις ενότητες του αποτελέσματος ανάλογα με το τι δουλεύεις.",
      "Κάνε απευθείας χειροκίνητες αλλαγές στο κείμενο όταν χρειάζεται.",
      "Άνοιξε το Lyrics Workspace όταν θέλεις επεξεργασία των στίχων ανά ενότητα και όχι ολόκληρου του lyric block μαζί.",
      "Τρέξε Quality Check όταν θέλεις αυτοματοποιημένο έλεγχο.",
      "Αποθήκευσε το αποτέλεσμα στη Library είτε ως ανεξάρτητο Prompt είτε μέσα σε Project.",
    ],
  },
  {
    id: "quality-check",
    title: "8. Quality Check",
    intro:
      "Το Quality Check αξιολογεί τους στίχους και το δημιουργικό brief. Είναι αυτοματοποιημένο εργαλείο ελέγχου και όχι αντικειμενική καλλιτεχνική κρίση ή νομικός έλεγχος copyright.",
    steps: [
      "Τρέξε Quality Check πάνω στο αποτέλεσμα που θέλεις να ελέγξεις.",
      "Δες το Passed / Failed και το score από 0 έως 10.",
      "Διάβασε τα πραγματικά issues. Ο έλεγχος μπορεί να εξετάζει γλώσσα, γραμματική, συνοχή, singability, cadence, rhyme, phrasing, συνέπεια με genre/brief και συναφή songwriting στοιχεία.",
      "Έλεγξε κάθε correction και suggestion ξεχωριστά — μην τα εφαρμόζεις μηχανικά.",
      "Όπου υπάρχουν actions διόρθωσης, χρησιμοποίησε Apply και Undo για να συγκρίνεις την πρόταση με το αρχικό.",
      "Μετά από σημαντικές αλλαγές μπορείς να ξανατρέξεις τον έλεγχο για νέο αποτέλεσμα.",
    ],
    note:
      "Το Passed δεν αποτελεί εγγύηση πρωτοτυπίας, νομικής ασφάλειας ή εμπορικής επιτυχίας. Το Failed δεν σημαίνει ότι το τραγούδι είναι καλλιτεχνικά άκυρο.",
  },
  {
    id: "saved-prompts",
    title: "9. Αποθηκευμένα Prompts",
    intro:
      "Ένα Saved Prompt είναι αποθηκευμένο αποτέλεσμα του Generator που μπορείς να ξαναβρείς αργότερα, αντί να εξαρτάσαι από την τρέχουσα συνεδρία.",
    steps: [
      "Μετά από generation επίλεξε Αποθήκευση Prompt.",
      "Δώσε ένα όνομα που σε βοηθά να το αναγνωρίζεις.",
      "Αν είναι ανεξάρτητη ιδέα, μπορείς να το αποθηκεύσεις χωρίς Project.",
      "Από τη Library μπορείς να αναζητάς και να ανοίγεις ξανά τα Saved Prompts.",
      "Χρησιμοποίησε Αναθεώρηση όταν θέλεις νέα AI-generated έκδοση βασισμένη σε υπάρχον Prompt.",
      "Χρησιμοποίησε Επεξεργασία στίχων όταν θέλεις να μπεις στο Lyrics Workspace.",
      "Χρησιμοποίησε Εξαγωγή για τοπικό αντίγραφο σε TXT, Markdown, HTML ή JSON.",
    ],
  },
  {
    id: "projects",
    title: "10. Projects και αυτόματα Versions",
    intro:
      "Τα Projects συγκεντρώνουν πολλές εκδόσεις της ίδιας μουσικής ιδέας. Έτσι μπορείς να εξελίσσεις το τραγούδι χωρίς να γράφεις πάνω στην προηγούμενη έκδοση.",
    steps: [
      "Κατά την αποθήκευση Prompt επίλεξε υπάρχον Project ή δημιούργησε νέο.",
      "Το πρώτο Prompt που αποθηκεύεται σε νέο Project παίρνει αυτόματα τον επόμενο διαθέσιμο αριθμό έκδοσης, αρχίζοντας από V1.",
      "Προαιρετικά πρόσθεσε Version Label, π.χ. «More Guitar», «New Chorus» ή «Radio Edit».",
      "Κάθε επόμενη έκδοση που αποθηκεύεται στο ίδιο Project παίρνει αυτόματα V2, V3, V4 κ.ο.κ.",
      "Οι παλιότερες εκδόσεις παραμένουν διαθέσιμες ώστε να συγκρίνεις την εξέλιξη του τραγουδιού αντί να αντικαθίστανται.",
      "Από το Project στη Library μπορείς να κρατάς μαζί τις εκδόσεις και το ιστορικό δημιουργίας.",
    ],
    note:
      "Η αρίθμηση γίνεται στο backend ανά Project ώστε δύο εκδόσεις να μην πάρουν κατά λάθος τον ίδιο αριθμό.",
  },
  {
    id: "project-revision",
    title: "11. Αναθεώρηση Project",
    intro:
      "Η Αναθεώρηση Project δημιουργεί νέα έκδοση από ήδη αποθηκευμένη έκδοση, χωρίς να πειράζει το αρχικό Prompt.",
    steps: [
      "Επίλεξε Αναθεώρηση Project στον Generator ή πάτησε Αναθεώρηση πάνω σε αποθηκευμένο Prompt.",
      "Επίλεξε το Project.",
      "Επίλεξε τη Βασική έκδοση που θέλεις να αλλάξεις, π.χ. V2, χωρίς να είσαι υποχρεωμένος να ξεκινήσεις από την τελευταία.",
      "Γράψε τι θέλεις να αλλάξει — π.χ. νέο Chorus, πιο σκοτεινή παραγωγή, χαμηλότερο BPM ή διατήρηση των Verse με νέο hook.",
      "Άλλαξε και τα τρέχοντα Generator settings αν θέλεις διαφορετικό μουσικό setup.",
      "Κάνε Generate της αναθεώρησης.",
      "Το νέο αποτέλεσμα αποθηκεύεται αυτόματα ως η επόμενη έκδοση στο ίδιο Project και δεν αντικαθιστά τη βασική έκδοση.",
    ],
  },
  {
    id: "lyrics-workspace",
    title: "12. Lyrics Workspace — επεξεργασία κομμάτι-κομμάτι",
    intro:
      "Το Lyrics Workspace είναι για στοχευμένες αλλαγές στους στίχους. Αντί να ζητάς από το AI να ξαναγράψει όλο το τραγούδι, μπορείς να δουλεύεις μία ενότητα κάθε φορά και να προστατεύεις όσα ήδη σου αρέσουν.",
    steps: [
      "Άνοιξε το Lyrics Workspace από αποτέλεσμα Generator ή από την Επεξεργασία στίχων στη Library.",
      "Δες το τραγούδι χωρισμένο σε Verse, Chorus, Bridge και τις υπόλοιπες ενότητες που έχουν αναγνωριστεί.",
      "Κλείδωσε μια ενότητα όταν δεν θέλεις να αλλάξει όσο δουλεύεις στις υπόλοιπες.",
      "Επίλεξε AI Edit στην ενότητα που θέλεις να βελτιώσεις.",
      "Γράψε Custom Instruction με το τι ακριβώς θέλεις να αλλάξει μόνο σε αυτή την ενότητα.",
      "Έλεγξε την πρόταση του AI πριν την εφαρμόσεις. Αν υπάρχουν περισσότερες προτάσεις, διάλεξε αυτή που προτιμάς.",
      "Εφάρμοσε την επιλεγμένη πρόταση μόνο στη συγκεκριμένη ενότητα.",
      "Χρησιμοποίησε Undo όταν θέλεις να αναιρέσεις την τελευταία εφαρμοσμένη AI αλλαγή σε μια ενότητα.",
      "Όταν τελειώσεις, πάτησε Αποθήκευση ως νέα έκδοση. Αν το Prompt ανήκει σε Project, οι νέοι στίχοι αποθηκεύονται ως επόμενο Version και δεν γράφουν πάνω στο προηγούμενο.",
    ],
    note:
      "Η λογική αυτή είναι ιδιαίτερα χρήσιμη όταν, για παράδειγμα, το Chorus είναι ήδη σωστό αλλά θέλεις να αλλάξεις μόνο ένα Verse.",
  },
  {
    id: "export",
    title: "13. Export Center",
    intro:
      "Το Export Center σου επιτρέπει να κρατάς τοπικό αντίγραφο ενός Prompt ή ολόκληρου Project έξω από το PromptBeats.",
    steps: [
      "Άνοιξε Εξαγωγή από Saved Prompt ή Project.",
      "Επίλεξε TXT, Markdown, HTML ή JSON.",
      "Για μεμονωμένο Prompt δημιουργείται ένα αρχείο με τα αποθηκευμένα στοιχεία του.",
      "Για Project επίλεξε Ολόκληρο Project — ένα αρχείο, ώστε Project, Creation Notes και όλες οι εκδόσεις να μπουν μαζί.",
      "Εναλλακτικά επίλεξε Project + Prompts — ξεχωριστά αρχεία, ώστε να πάρεις ZIP με ένα summary και ένα αρχείο ανά Version.",
    ],
  },
  {
    id: "upload-publish",
    title: "14. Προσθήκη και δημοσίευση τραγουδιών",
    intro:
      "Το PromptBeats μπορεί να αποθηκεύει tracks που ανεβάζεις απευθείας και μπορεί επίσης να συνδέει υποστηριζόμενα εξωτερικά tracks, όπως Suno ή Udio.",
    steps: [
      "Άνοιξε το interface υποβολής track / Studio.",
      "Επίλεξε πηγή audio: απευθείας upload, Suno ή Udio όπου είναι διαθέσιμα.",
      "Σε απευθείας upload επίλεξε audio file και προαιρετικό cover artwork και δήλωσε με ποια πλατφόρμα ή εργαλείο δημιουργήθηκε όταν ζητείται.",
      "Για Suno ή Udio πρόσθεσε έγκυρο υποστηριζόμενο link.",
      "Επίλεξε αν το track θα είναι Public ή Private.",
      "Ενεργοποίησε Explicit όταν οι στίχοι περιέχουν έντονη ή ρητή γλώσσα που πρέπει να γνωρίζει ο ακροατής.",
      "Στα uploaded audio επίλεξε αν επιτρέπεις σε άλλους συνδεδεμένους χρήστες να κατεβάζουν το αρχείο.",
      "Συμπλήρωσε τίτλο, genre και τα υπόλοιπα διαθέσιμα στοιχεία και αποθήκευσε ή δημοσίευσε.",
    ],
  },
  {
    id: "track-controls",
    title: "15. Επεξεργασία track και ορατότητας",
    intro:
      "Ο ιδιοκτήτης ενός track μπορεί να αλλάξει τις πληροφορίες και την ορατότητά του και μετά την αποθήκευση.",
    steps: [
      "Άνοιξε Edit σε δικό σου track.",
      "Άλλαξε τίτλο, genre και όποια άλλα metadata είναι επεξεργάσιμα.",
      "Άλλαξε το ίδιο το track μεταξύ Public και Private.",
      "Ρύθμισε ξεχωριστά Prompt visibility και Lyrics visibility όπου εμφανίζονται αυτές οι επιλογές.",
      "Στα direct uploads μπορείς να αλλάξεις το Allow Download.",
      "Ενημέρωσε το Explicit label όταν χρειάζεται.",
      "Στα uploaded tracks μπορείς να αντικαταστήσεις audio ή cover όπου η λειτουργία είναι διαθέσιμη.",
      "Χρησιμοποίησε Delete μόνο όταν θέλεις πραγματικά οριστική διαγραφή του track.",
    ],
  },
  {
    id: "library-social",
    title: "16. Library, Favorites, Likes και Playlists",
    intro:
      "Η Library είναι το βασικό σημείο οργάνωσης του δημιουργικού σου υλικού και της μουσικής που θέλεις να βρίσκεις εύκολα.",
    steps: [
      "Χρησιμοποίησε τα Saved Prompts για τη δουλειά του Generator και τα Projects.",
      "Χρησιμοποίησε Favorites για tracks που θέλεις να βρίσκεις γρήγορα ξανά.",
      "Χρησιμοποίησε Like για αλληλεπίδραση με δημόσιο track όπου η λειτουργία είναι διαθέσιμη.",
      "Δημιούργησε playlists και πρόσθεσε tracks για να οργανώνεις μουσική σε συλλογές.",
      "Άλλαξε το διαθέσιμο Library view όταν προτιμάς standard, compact ή list εμφάνιση.",
      "Η προσθήκη σε Favorites ή playlist δεν σου μεταβιβάζει δικαιώματα πάνω στο track άλλου δημιουργού.",
    ],
  },
  {
    id: "follow-notifications",
    title: "17. Follow Creators και Notifications",
    intro:
      "Το PromptBeats διαθέτει follow creators και in-app notifications ώστε να παρακολουθείς δημιουργούς που σε ενδιαφέρουν.",
    steps: [
      "Άνοιξε το δημόσιο profile ενός creator.",
      "Πάτησε Ακολούθησε. Αν αργότερα δεν θέλεις να τον ακολουθείς, πάτησε ξανά στην κατάσταση Ακολουθείς.",
      "Άνοιξε τους αριθμούς Followers ή Following για να δεις τα αντίστοιχα δημόσια creator profiles.",
      "Πάτησε το εικονίδιο με το καμπανάκι για το Notification Center.",
      "Οι ειδοποιήσεις μπορούν να περιλαμβάνουν γεγονότα όπως νέο follower ή νέο track από creator που ακολουθείς, ανάλογα με τις ενεργές προτιμήσεις.",
      "Από τα settings του Notification Center ρύθμισε τις υποστηριζόμενες κατηγορίες ειδοποιήσεων.",
      "Σήμανε μεμονωμένες ή όλες τις ειδοποιήσεις ως αναγνωσμένες όταν θέλεις.",
    ],
  },
  {
    id: "sharing",
    title: "18. Sharing και Public Links",
    intro:
      "Οι λειτουργίες sharing επιτρέπουν την πρόσβαση σε υποστηριζόμενο περιεχόμενο μέσω link.",
    steps: [
      "Χρησιμοποίησε Share / Public Link στο σχετικό track ή περιεχόμενο όπου εμφανίζεται.",
      "Θεώρησε κάθε public ή shareable link ως link που μπορεί να προωθηθεί και σε άλλα άτομα.",
      "Μην χρησιμοποιείς public link για περιεχόμενο που θέλεις να παραμένει απρόσιτο σε οποιονδήποτε αποκτήσει το link.",
      "Η μελλοντική ανάκληση ή διαγραφή ενός link δεν μπορεί να διαγράψει αντίγραφα, screenshots ή downloads που έχουν ήδη δημιουργήσει τρίτοι.",
    ],
  },
  {
    id: "external-media",
    title: "19. Ενσωματωμένοι players Suno και Udio",
    intro:
      "Το PromptBeats δεν φορτώνει αυτόματα τους υποστηριζόμενους third-party embedded players πριν επιτρέψεις external media.",
    steps: [
      "Όταν ένα Suno ή Udio embed δεν έχει ακόμα επιτραπεί, εμφανίζεται ενημερωτικό μήνυμα αντί να φορτωθεί αμέσως το iframe.",
      "Πάτησε Allow external media αν θέλεις να φορτωθεί ο player του τρίτου provider.",
      "Μετά την άδεια, τα υποστηριζόμενα embeds μπορούν να φορτώνουν όταν πλησιάζουν στην ορατή περιοχή της σελίδας.",
      "Όπου υπάρχει provider link, μπορείς πάντα να ανοίξεις το track απευθείας στη σελίδα του εξωτερικού provider.",
    ],
    note:
      "Οι εξωτερικοί providers λειτουργούν με τους δικούς τους όρους και τις δικές τους πρακτικές απορρήτου.",
  },
  {
    id: "profile",
    title: "20. Profile και γλώσσα εφαρμογής",
    intro:
      "Το δημόσιο profile σου είναι η παρουσία σου ως creator μέσα στο PromptBeats.",
    steps: [
      "Επεξεργάσου τα στοιχεία του profile από τα διαθέσιμα controls.",
      "Επίλεξε προσεκτικά τι εμφανίζεις δημόσια, γιατί τα public profile στοιχεία μπορεί να είναι ορατά σε άλλους χρήστες ή επισκέπτες.",
      "Η δημόσια creator σελίδα μπορεί να εμφανίζει public tracks και υποστηριζόμενα social στοιχεία.",
      "Χρησιμοποίησε το language selector για Ελληνικά ή Αγγλικά. Το PromptBeats θυμάται την επιλογή interface.",
    ],
  },
  {
    id: "reports",
    title: "21. Reports, moderation cases και appeals",
    intro:
      "Χρησιμοποίησε το reporting system όταν θεωρείς ότι track ή σχετικό περιεχόμενο παραβιάζει τους κανόνες του PromptBeats, δικαιώματα ή την εφαρμοστέα νομοθεσία.",
    steps: [
      "Πάτησε Report στο σχετικό track και επίλεξε τον λόγο που περιγράφει καλύτερα το ζήτημα.",
      "Δώσε αρκετές πληροφορίες ώστε να μπορεί να κατανοηθεί το report. Η υποβολή report δεν αφαιρεί αυτόματα το περιεχόμενο.",
      "Αν χρειάζεται περαιτέρω εξέταση, μπορεί να δημιουργηθεί moderation case και να υπάρξει επικοινωνία με τον creator μέσα στην υπόθεση.",
      "Αν είσαι ο επηρεαζόμενος creator, απάντησε μέσα στο ενεργό case όταν ζητούνται πληροφορίες, διευκρινίσεις ή proof of rights.",
      "Αν η απόφαση επιδέχεται ένσταση, χρησιμοποίησε Appeal / Request Review και εξήγησε γιατί θεωρείς ότι πρέπει να επανεξεταστεί.",
      "Το appeal επανεξετάζεται σε Admin level και η τελική έγκριση γίνεται από Super Admin σύμφωνα με το τρέχον workflow.",
      "Για formal Copyright / IP Notice χρησιμοποίησε το επίσημο κανάλι της Copyright / Intellectual Property Policy και όχι απλώς το γενικό in-app Report.",
    ],
  },
  {
    id: "workflow",
    title: "22. Ένα πρακτικό workflow στο PromptBeats",
    intro:
      "Δεν υπάρχει ένας μοναδικός σωστός τρόπος χρήσης, αλλά η παρακάτω ροή συνδυάζει αποτελεσματικά τις βασικές λειτουργίες.",
    steps: [
      "Ξεκίνα με Basic για γρήγορη ιδέα ή Advanced όταν γνωρίζεις ήδη τη μουσική κατεύθυνση.",
      "Αν έχεις μόνο μια γενική ιδέα, χρησιμοποίησε τον Song Setup Assistant για να δημιουργήσει το Advanced setup.",
      "Χρησιμοποίησε Smart Presets και Song Blueprint όταν θέλεις μεγαλύτερο έλεγχο μουσικής ταυτότητας, δομής και ενορχήστρωσης.",
      "Κάνε Generate.",
      "Τρέξε Quality Check και έλεγξε τα findings.",
      "Χρησιμοποίησε Lyrics Workspace για στοχευμένες αλλαγές ανά ενότητα.",
      "Αποθήκευσε το αποτέλεσμα σε Project ώστε οι επόμενες αλλαγές να γίνονται αυτόματα V2, V3 κ.ο.κ.",
      "Χρησιμοποίησε Project Revision όταν θέλεις νέα AI-generated έκδοση χωρίς να χάσεις παλιότερη.",
      "Κάνε Export όταν θέλεις offline αντίγραφο.",
      "Όταν υπάρχει τελικό audio, ανέβασέ το ή σύνδεσε υποστηριζόμενη εξωτερική πηγή, όρισε visibility και publishing options και μοίρασέ το μέσω PromptBeats.",
    ],
  },
];

const iconForSection = (id: string) => {
  if (id.includes("generator") || id === "setup-assistant" || id === "smart-presets" || id === "structure-blueprint") return Wand2;
  if (id === "quality-check") return CheckCircle2;
  if (id === "saved-prompts") return Save;
  if (id === "projects" || id === "project-revision" || id === "lyrics-workspace") return FolderOpen;
  if (id === "export") return Download;
  if (id === "upload-publish" || id === "track-controls") return Upload;
  if (id === "library-social") return Heart;
  if (id === "follow-notifications" || id === "profile") return UserRound;
  if (id === "sharing" || id === "external-media") return Share2;
  if (id === "reports") return MessageSquareWarning;
  if (id === "workflow") return Music2;
  return BookOpen;
};

function HelpPage() {
  const { language } = useI18n();
  const el = language === "el";
  const sections = el ? greekSections : englishSections;

  return (
    <AppShell
      header={
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-accent">
            {el ? "Βοήθεια" : "Help"}
          </p>
          <h1 className="font-display text-xl font-bold sm:text-2xl">
            {el ? "Οδηγός Χρήσης PromptBeats" : "PromptBeats User Guide"}
          </h1>
        </div>
      }
    >
      <main className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-8">
        <section className="glass-strong overflow-hidden rounded-3xl border border-white/10 p-5 sm:p-7">
          <div className="flex items-start gap-4">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-accent/30 bg-accent/10 text-accent">
              <CircleHelp className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <h2 className="font-display text-2xl font-bold sm:text-3xl">
                {el ? "Πώς χρησιμοποιείται το PromptBeats" : "How to use PromptBeats"}
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                {el
                  ? "Ο οδηγός αυτός εξηγεί τις βασικές λειτουργίες που είναι διαθέσιμες στους χρήστες: AI Generator, Advanced Mode, Song Setup Assistant, Smart Presets, Quality Check, Saved Prompts, Projects και Versions, Lyrics Workspace, Export, tracks, Library και κοινωνικές λειτουργίες."
                  : "This guide explains the main user-facing features: AI Generator, Advanced Mode, Song Setup Assistant, Smart Presets, Quality Check, Saved Prompts, Projects and Versions, Lyrics Workspace, Export, tracks, Library and social features."}
              </p>
              <p className="mt-3 text-xs text-muted-foreground">
                {el
                  ? "Οι εσωτερικές, δοκιμαστικές ή staff-only λειτουργίες δεν περιλαμβάνονται σε αυτόν τον οδηγό."
                  : "Internal, testing-only and staff-only features are not included in this guide."}
              </p>
            </div>
          </div>
        </section>

        <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {sections.map((section) => {
            const Icon = iconForSection(section.id);
            return (
              <a
                key={section.id}
                href={`#${section.id}`}
                className="glass flex items-center gap-3 rounded-2xl border border-white/10 p-3 text-sm transition-colors hover:border-accent/40 hover:text-accent"
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="line-clamp-2">{section.title}</span>
              </a>
            );
          })}
        </section>

        <div className="mt-8 space-y-5">
          {sections.map((section) => {
            const Icon = iconForSection(section.id);
            return (
              <section
                key={section.id}
                id={section.id}
                className="scroll-mt-24 rounded-3xl border border-white/10 bg-black/20 p-5 sm:p-7"
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-accent/25 bg-accent/[0.08] text-accent">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="font-display text-lg font-bold sm:text-xl">{section.title}</h2>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{section.intro}</p>
                  </div>
                </div>

                <ol className="mt-5 space-y-3">
                  {section.steps.map((step, index) => (
                    <li key={`${section.id}-${index}`} className="flex gap-3 text-sm leading-6">
                      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-[11px] font-bold text-accent">
                        {index + 1}
                      </span>
                      <span className="text-foreground/90">{step}</span>
                    </li>
                  ))}
                </ol>

                {section.note && (
                  <div className="mt-5 rounded-2xl border border-accent/20 bg-accent/[0.04] p-4 text-xs leading-5 text-muted-foreground">
                    <span className="font-semibold text-accent">{el ? "Σημείωση: " : "Note: "}</span>
                    {section.note}
                  </div>
                )}
              </section>
            );
          })}
        </div>

        <section className="mt-8 rounded-3xl border border-white/10 bg-black/20 p-5 text-center sm:p-7">
          <Languages className="mx-auto h-5 w-5 text-accent" />
          <h2 className="mt-3 font-display text-lg font-bold">
            {el ? "Χρειάζεσαι επιπλέον βοήθεια;" : "Need more help?"}
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
            {el
              ? "Αν κάτι δεν λειτουργεί όπως περιγράφεται εδώ ή χρειάζεσαι διευκρίνιση, χρησιμοποίησε τη σελίδα Επικοινωνία."
              : "If something does not behave as described here or you need clarification, use the Contact page."}
          </p>
          <Link
            to="/contact"
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-gradient-neon px-4 py-2.5 text-sm font-semibold text-primary-foreground glow-neon"
          >
            <Sparkles className="h-4 w-4" />
            {el ? "Επικοινωνία" : "Contact Us"}
          </Link>
        </section>
      </main>
    </AppShell>
  );
}
