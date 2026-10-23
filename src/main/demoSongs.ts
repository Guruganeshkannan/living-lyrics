/**
 * Original sample lyrics for the QA / demo harness (no copyrighted text).
 * Each has verses, a repeated chorus and a bridge so every visual path gets exercised.
 */
export interface DemoSong {
  id: string
  title: string
  verse: string[]
  chorus: string[]
  bridge: string[]
}

export const DEMO_SONGS: DemoSong[] = [
  {
    id: 'en',
    title: 'Neon Hearts',
    verse: ['Lights go up, the bass is loud tonight', 'Hands up high, we dance until the light', 'Feel the fire running through the crowd', 'Jump with me and scream it out loud'],
    chorus: ['We are electric, we are alive', 'Turn it up, turn it up, we never die'],
    bridge: ['Break the night and shatter every wall', 'Fly with me, we will never fall']
  },
  {
    id: 'en-revenge',
    title: 'Payback',
    verse: ['You lied to me, now watch it burn', 'Every scar becomes a blade', 'Cold blood running through my veins', 'Your crown is ashes, liar'],
    chorus: ["This is payback, karma's coming", "Blood on the floor, I'm done running"],
    bridge: ['Rage like thunder, I will not bow', 'Your war is over now']
  },
  {
    id: 'ta',
    title: 'நிலவே நீ',
    verse: ['நிலவே நீ என் அருகில் வா', 'உன் கண்களில் என் கனவு', 'மழை தூறும் இந்த இரவில்', 'என் இதயம் உன் பெயர் சொல்லும்'],
    chorus: ['காதலே காதலே என் உயிரே', 'உன்னோடு நான் வாழ்வேன் கண்ணே'],
    bridge: ['முத்தம் ஒன்று தந்தாய் அன்பே', 'தென்றல் போல நீ வந்தாய்']
  },
  {
    id: 'ta-rom',
    title: 'Aattam Podu',
    verse: ['Vaa da vaa machan aattam podu', 'Kuthu beat therikka vidu', 'Enna da idhu semma vibe', 'Nee illa naan illa party illa'],
    chorus: ['Verithanam verithanam', 'Mass gethu namma kuthu aattam'],
    bridge: ['Saravedi pattasu vedikkum', 'Adhiradi aattam podu']
  },
  {
    id: 'hi',
    title: 'तन्हा रात',
    verse: ['टूटा दिल लेकर चलता हूँ', 'आँसू मेरे कोई ना देखे', 'तेरी यादें हर पल साथ हैं', 'बारिश में भी जलता है ये मन'],
    chorus: ['तन्हा हूँ मैं, तन्हा ये रात', 'जुदाई का दर्द, तेरी हर बात'],
    bridge: ['अलविदा कह कर तू चला गया', 'टूटे ख़्वाब बिखर गए']
  },
  {
    id: 'te',
    title: 'గెలుపు',
    verse: ['లేచి నిలబడు వీరుడా', 'గుండె నిండా ధైర్యం ఉంది', 'విజయం మనదే ఈ రోజు', 'దుమ్ము రేపే దరువు వేయి'],
    chorus: ['జై జై జై గెలుపు మనదే', 'సింహంలా గర్జించు రా'],
    bridge: ['వెలుగు నిండిన ఆకాశం', 'ఎగిరే రెక్కలు మనవే']
  },
  {
    id: 'kn',
    title: 'ನೆನಪು',
    verse: ['ಹಳೆಯ ನೆನಪು ಮತ್ತೆ ಬಂದಿದೆ', 'ಮಳೆಯ ಹನಿಗಳ ಸದ್ದಿನಲ್ಲಿ', 'ಅಮ್ಮನ ಜೋಗುಳ ಕೇಳಿದೆ', 'ಬಾಲ್ಯದ ಗೆಳೆಯ ಎಲ್ಲಿ ಹೋದೆ'],
    chorus: ['ನೆನಪುಗಳೇ ನನ್ನ ಜೊತೆಗೆ', 'ಬಾಲ್ಯದ ಬೆಳಕು ಮನಸಿಗೆ'],
    bridge: ['ತಂಗಾಳಿ ಬೀಸಿದೆ ಇಂದು', 'ಶಾಂತಿ ತುಂಬಿದ ಸಂಜೆ']
  },
  {
    id: 'ml',
    title: 'മഴ',
    verse: ['മഴ പെയ്യുന്ന രാവിൽ', 'നിന്റെ ഓർമ്മകൾ എന്നിൽ', 'എന്റെ പ്രണയം നീ മാത്രം', 'നിലാവ് പോലെ നീ വന്നു'],
    chorus: ['പൊന്നേ നീ എൻ ഹൃദയം', 'അനുരാഗം നിറയും രാവ്'],
    bridge: ['കിനാവിൽ നീ ചിരിച്ചു', 'തെന്നൽ പോലെ നീ']
  },
  {
    id: 'ur',
    title: 'ہجر',
    verse: ['دل میں درد ہے آج بھی', 'آنسو بہتے ہیں راتوں کو', 'تنہائی میں تیری یاد', 'ٹوٹا خواب بکھر گیا'],
    chorus: ['جدائی کی یہ رات ہے', 'اداس دل کی بات ہے'],
    bridge: ['الوداع کہہ کر چلے گئے', 'غم کا سایہ ہے']
  },
  {
    id: 'bn',
    title: 'ভালোবাসা',
    verse: ['আমার মনের আকাশে তুমি', 'চাঁদের আলোয় তোমার হাসি', 'স্বপ্নে তুমি আসো রোজ', 'বৃষ্টি ভেজা এই রাতে'],
    chorus: ['ভালোবাসা তুমি আমার', 'হৃদয় জুড়ে শুধু তুমি'],
    bridge: ['প্রিয় তুমি থেকো পাশে', 'প্রেম আমার চিরদিন']
  }
]

const LINE_MS = 3600

function stamp(ms: number): string {
  const m = Math.floor(ms / 60000)
  const s = (ms % 60000) / 1000
  return `[${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}]`
}

/** Build an LRC: intro gap, verse, chorus ×2, verse, chorus, bridge, chorus. */
export function demoLrc(song: DemoSong): { lrc: string; durationMs: number } {
  const order = [...song.verse.slice(0, 2), ...song.chorus, ...song.chorus, ...song.verse.slice(2), '', ...song.bridge, ...song.chorus, ...song.chorus]
  let t = 3000
  const rows: string[] = []
  for (const line of order) {
    rows.push(`${stamp(t)}${line}`)
    t += line ? LINE_MS : 1200
  }
  rows.push(`${stamp(t)}`)
  return { lrc: rows.join('\n'), durationMs: t + 4000 }
}
