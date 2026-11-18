/** Room codes are 6 characters, letters and numbers, shown in uppercase. */
export const ROOM_CODE_LENGTH = 6;
export const ROOM_NAME_MAX = 40;
export const MESSAGE_MAX = 1000;

/** Turn whatever someone typed ("ab c-12x") into the stored code form ("ABC12X"). */
export function normalizeRoomCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, ROOM_CODE_LENGTH);
}

export function isCompleteRoomCode(input: string): boolean {
  return normalizeRoomCode(input).length === ROOM_CODE_LENGTH;
}
