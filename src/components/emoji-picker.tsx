import EmojiPicker, { Theme } from "emoji-picker-react";

/** Full emoji list; loaded only when someone opens it. */
export default function FullEmojiPicker({ onPick }: { onPick: (emoji: string) => void }) {
  return (
    <EmojiPicker
      theme={Theme.DARK}
      lazyLoadEmojis
      width={320}
      height={380}
      previewConfig={{ showPreview: false }}
      onEmojiClick={(data) => onPick(data.emoji)}
    />
  );
}
