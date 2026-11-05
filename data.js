// Everything people can choose, and everything the bus can say.
// Edit freely: the rest of the code reads from here.

export const NAMES = {
  real: ['grace', 'kiki', 'mickael', 'tony', 'marilyn', 'sarah', 'julianna', 'raimundo', 'maurice', 'moritz', 'adam', 'claire', 'prabu', 'aya'],
  vegetation: ['bush', 'grass', 'iris', 'hibiscus'],
  animals: ['lion', 'tiger'],
  places: ['mississipi'],
  food: ['cookie', 'steak', 'potato', 'tomato', 'salad'],
  adjectives: ['shy', 'tacky', 'mysterious', 'happy', 'crazy', 'jazzy', 'tomodachi'],
};

// "you" in an action is replaced by the closest person, or by "nobody".
export const ACTIONS = [
  { id: 'sun', category: 'contemplates', text: 'contemplates the sun' },
  { id: 'rain', category: 'contemplates', text: 'follows the rain drops with their fingers' },
  { id: 'read', category: 'perform', text: 'pretends to read' },
  { id: 'think', category: 'perform', text: 'thinks very hard' },
  { id: 'bar', category: 'flop', text: "couldn't grab the bar" },
  { id: 'wave', category: 'nice', text: 'waves at you' },
  { id: 'photo', category: 'bad', text: 'tries to take a picture of you' },
];

// Hand-written mixes. These are the fallback lines once Claude writes the mixes.
// {1} is the person doing the first action in the key, {2} the second.
export const MIXES = {
  'sun+sun': '{1} and {2} contemplate the same sun from different windows',
  'sun+rain': '{1} points at the sun while {2} traces the rain on the glass. neither of them is wrong',
  'sun+read': '{2} holds the book upside down so {1} can keep looking at the sun',
  'sun+think': '{2} thinks very hard about the sun {1} is contemplating',
  'sun+bar': "{2} misses the bar and falls into {1}'s sun",
  'sun+wave': '{2} waves at {1}, who thinks it is the sun',
  'sun+photo': '{2} tries to photograph {1} contemplating the sun. it is overexposed',
  'rain+rain': '{1} and {2} race their fingers down the same window',
  'rain+read': '{2} pretends to read the rain {1} is following',
  'rain+think': "{2} thinks very hard about where {1}'s raindrop is going",
  'rain+bar': "{2} couldn't grab the bar, so grabs {1}'s raindrop instead",
  'rain+wave': '{2} waves at {1} through the rain on the window',
  'rain+photo': "{2} takes a picture of {1}'s finger on the wet window. it's blurry",
  'read+read': '{1} and {2} pretend to read the same page',
  'read+think': "{2} thinks very hard about what {1} isn't reading",
  'read+bar': "{2} missed the bar and landed on {1}'s book",
  'read+wave': '{2} waves at {1}, who turns the page and pretends not to see',
  'read+photo': '{2} tries to take a picture of {1}, who hides behind the book',
  'think+think': '{1} and {2} think very hard about the same thing. neither will ever know',
  'think+bar': '{1} is thinking too hard to notice {2} missing the bar',
  'think+wave': '{2} waves at {1}, who is thinking too hard to wave back',
  'think+photo': '{2} photographs {1} thinking very hard. it looks like a passport photo',
  'bar+bar': '{1} and {2} both miss the bar and hold on to each other instead',
  'bar+wave': '{2} waves at {1}. {1} waves back, which is why {1} missed the bar',
  'bar+photo': '{2} got the picture at the exact moment {1} missed the bar',
  'wave+wave': '{1} and {2} wave at each other, then look away',
  'wave+photo': '{2} tries to take a picture of {1}, who waves right into the lens',
  'photo+photo': '{1} and {2} try to take a picture of each other. both pictures are of phones',
};

// Used when an action you add later has no hand-written mix yet.
export const GENERIC_MIX = '{1} and {2} share a look';
