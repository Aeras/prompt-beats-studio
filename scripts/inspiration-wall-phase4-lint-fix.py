from pathlib import Path

path = Path("src/components/promptbeats/InspirationWallDirectionPanel.tsx")
s = path.read_text()
s = s.replace("const useInSongSetup = async () => {", "const openSongSetup = async () => {")
s = s.replace("onClick={() => void useInSongSetup()}", "onClick={() => void openSongSetup()}")
path.write_text(s)
