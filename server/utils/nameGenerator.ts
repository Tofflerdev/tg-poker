const adjectives = [
  'Lucky', 'Bold', 'Swift', 'Calm', 'Brave', 'Wise', 'Cool', 'Wild', 'Sly', 'Keen',
  'Happy', 'Jolly', 'Quick', 'Bright', 'Sharp', 'Grand', 'Noble', 'Proud', 'Fair', 'Kind'
];

const nouns = [
  'Tiger', 'Eagle', 'Fox', 'Bear', 'Wolf', 'Hawk', 'Lion', 'Shark', 'Cobra', 'Raven',
  'Panda', 'Falcon', 'Otter', 'Lynx', 'Viper', 'Stag', 'Bull', 'Horse', 'Dragon', 'Phoenix'
];

export function generateRandomName(): string {
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const num = Math.floor(Math.random() * 90) + 10; // 10-99
  return `${adj} ${noun} ${num}`;
}
