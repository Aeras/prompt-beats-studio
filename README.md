# PromptBeats Studio

New project with nBuild the complete responsive UI layout for 'PromptBeats', a dark-mode glassmorphism AI music sharing platform and studio.

​Aesthetic & Theme:

​Deep OLED black background (#0a0a0c) with sleek, semi-transparent frosted glass cards/panels (glassmorphism with subtle borders).

​Accent colors: Neon purple (#a855f7) and electric blue (#06b6d4).

​Layout & Components:

​Sidebar Navigation (Left):

​Clean, minimal sidebar with glowing active icons: 'Discover Feed', 'Trending', 'AI Prompt Studio', 'My Library', and a prominent 'Submit Track' button.

​User profile avatar and login status at the bottom of the sidebar.

​Main Viewport (Center):

​Top Bar: Sticky search bar with horizontal rounded pill-buttons for genre filters (Reggaeton, Cumbia, Italo Disco, Synthwave, Acoustic, Hip-Hop).

​Feed Grid: A responsive grid displaying track cards. Each card features: album artwork thumbnail, track title, creator handle, play overlay button, copy prompt button, and expandable lyrics preview.

​AI Studio Tab/Modal: A secondary view/modal dedicated to prompt crafting and lyrics editing, featuring glowing neon tag pills (like [Intro], [Verse], [Chorus], [Drop], [Outro]).

​Hi-Fi Global Audio Player (Persistent Bottom Bar):

​Fixed at the bottom of the screen.

​Left: Now playing track thumbnail, title, and creator.

​Center: Play/Pause/Skip controls, scrubbable progress bar with time stamps.

​Right: A stylized vintage Technics-inspired stereo LED spectrum analyzer (green-to-red jumping bars visualizer), volume slider, and a button to toggle Picture-in-Picture mode.

​Responsiveness (Tailwind Mobile-First):

​Desktop/Tablet: Multi-column layout with fixed sidebar, spacious track grid, and full audio controls.

​Mobile: Sidebar collapses into a sliding hamburger drawer or a sleek bottom tab bar. Feed stacks into single-column touch-friendly cards. Player bar stays pinned with compact controls.ame promptbeats.app

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://prompt-beats-studio.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/5e47f960-74f1-4eda-9749-0196542f1025).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
