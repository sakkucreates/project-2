'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Search, X, Smile, ThumbsUp, Heart, Sparkles, Coffee, Compass } from 'lucide-react';

export interface EmojiPickerProps {
  onSelectEmoji: (emoji: string) => void;
  onClose: () => void;
}

interface EmojiCategory {
  id: string;
  name: string;
  icon: React.ReactNode;
  emojis: { char: string; keywords: string }[];
}

const EMOJI_CATEGORIES: EmojiCategory[] = [
  {
    id: 'smileys',
    name: 'Smileys & Emotion',
    icon: <Smile className="w-4 h-4" />,
    emojis: [
      { char: '😀', keywords: 'grinning smile happy face' },
      { char: '😃', keywords: 'smiley happy joy' },
      { char: '😄', keywords: 'smile laugh happy' },
      { char: '😁', keywords: 'grin beaming' },
      { char: '😆', keywords: 'laughing squint' },
      { char: '😅', keywords: 'sweat smile relief' },
      { char: '🤣', keywords: 'rofl rolling laughter' },
      { char: '😂', keywords: 'joy tears laugh haha' },
      { char: '🙂', keywords: 'slightly smiling' },
      { char: '🙃', keywords: 'upside down silly' },
      { char: '😉', keywords: 'wink flirt' },
      { char: '😊', keywords: 'blush smile warm' },
      { char: '😇', keywords: 'angel innocent halo' },
      { char: '🥰', keywords: 'hearts in love fond' },
      { char: '😍', keywords: 'heart eyes love adore' },
      { char: '🤩', keywords: 'star struck excited' },
      { char: '😘', keywords: 'kiss heart blow' },
      { char: '😗', keywords: 'kissing' },
      { char: '😚', keywords: 'kissing closed eyes' },
      { char: '😋', keywords: 'yum delicious tongue' },
      { char: '😛', keywords: 'tongue silly' },
      { char: '😜', keywords: 'wink tongue joke' },
      { char: '🤪', keywords: 'zany crazy wild' },
      { char: '😝', keywords: 'squint tongue prank' },
      { char: '🤑', keywords: 'money face rich cash' },
      { char: '🤗', keywords: 'hugging warm embrace' },
      { char: '🤭', keywords: 'hand over mouth oops' },
      { char: '🤫', keywords: 'shushing quiet secret' },
      { char: '🤔', keywords: 'thinking ponder hmm' },
      { char: '🤐', keywords: 'zipper mouth silent' },
      { char: '🤨', keywords: 'raised eyebrow suspicious' },
      { char: '😐', keywords: 'neutral plain poker' },
      { char: '😑', keywords: 'expressionless blank' },
      { char: '😶', keywords: 'no mouth quiet' },
      { char: '😏', keywords: 'smirk sneaky sly' },
      { char: '😒', keywords: 'unamused annoyed' },
      { char: '🙄', keywords: 'roll eyes whatever' },
      { char: '😬', keywords: 'grimacing awkward' },
      { char: '🤥', keywords: 'lying pinocchio' },
      { char: '😌', keywords: 'relieved peaceful' },
      { char: '😔', keywords: 'pensive sad sorrow' },
      { char: '😪', keywords: 'sleepy tired' },
      { char: '🤤', keywords: 'drooling hungry' },
      { char: '😴', keywords: 'sleeping zzz night' },
      { char: '😷', keywords: 'mask sick medical' },
      { char: '🤒', keywords: 'thermometer unwell fever' },
      { char: '🤕', keywords: 'bandage hurt injury' },
      { char: '🤢', keywords: 'nauseated sick gross' },
      { char: '🤮', keywords: 'vomiting puke' },
      { char: '🤧', keywords: 'sneezing cold tissue' },
      { char: '🥵', keywords: 'hot heat sweating' },
      { char: '🥶', keywords: 'cold freezing ice' },
      { char: '🥴', keywords: 'woozy dizzy tipsy' },
      { char: '😵', keywords: 'dizzy knocked out' },
      { char: '🤯', keywords: 'mind blown explosion wow' },
      { char: '🤠', keywords: 'cowboy hat yeehaw' },
      { char: '🥳', keywords: 'partying celebration horn' },
      { char: '😎', keywords: 'cool sunglasses chill' },
      { char: '🤓', keywords: 'nerd smart glasses' },
      { char: '🧐', keywords: 'monocle classy inspect' },
      { char: '😕', keywords: 'confused puzzled' },
      { char: '😟', keywords: 'worried nervous' },
      { char: '🙁', keywords: 'slightly frowning' },
      { char: '😮', keywords: 'surprised open mouth' },
      { char: '😯', keywords: 'hushed quiet shock' },
      { char: '😲', keywords: 'astonished gasp' },
      { char: '😳', keywords: 'flushed blushing red' },
      { char: '🥺', keywords: 'pleading puppy eyes please' },
      { char: '😦', keywords: 'frowning open' },
      { char: '😧', keywords: 'anguished pain' },
      { char: '😰', keywords: 'anxious sweat blue' },
      { char: '😥', keywords: 'sad relieved tear' },
      { char: '😢', keywords: 'crying tear sad' },
      { char: '😭', keywords: 'sobbing loud bawling' },
      { char: '😱', keywords: 'screaming fear shock' },
      { char: '😖', keywords: 'confounded struggle' },
      { char: '😣', keywords: 'persevering suffer' },
      { char: '😞', keywords: 'disappointed down' },
      { char: '😓', keywords: 'downcast sweat work' },
      { char: '😩', keywords: 'weary tired frustrated' },
      { char: '😫', keywords: 'tired exhausted groan' },
      { char: '🥱', keywords: 'yawning sleepy bored' },
      { char: '😤', keywords: 'triumph steam proud' },
      { char: '😡', keywords: 'rage pouting mad angry' },
      { char: '😠', keywords: 'angry mad upset' },
      { char: '🤬', keywords: 'cursing swearing symbols' },
      { char: '😈', keywords: 'devil smile evil purple' },
      { char: '👿', keywords: 'angry devil horns' },
      { char: '💀', keywords: 'skull dead skeleton haha' },
      { char: '💩', keywords: 'poop funny brown' },
      { char: '🤡', keywords: 'clown circus foolish' },
      { char: '👻', keywords: 'ghost spooky halloween boo' },
    ],
  },
  {
    id: 'gestures',
    name: 'Gestures & People',
    icon: <ThumbsUp className="w-4 h-4" />,
    emojis: [
      { char: '👋', keywords: 'wave hello hi goodbye' },
      { char: '🤚', keywords: 'raised back hand' },
      { char: '🖐️', keywords: 'hand splayed fingers' },
      { char: '✋', keywords: 'raised hand stop high five' },
      { char: '🖖', keywords: 'vulcan spock live long' },
      { char: '👌', keywords: 'ok fine perfect great' },
      { char: '🤌', keywords: 'pinched fingers italian what' },
      { char: '🤏', keywords: 'pinching small little bit' },
      { char: '✌️', keywords: 'peace victory two' },
      { char: '🤞', keywords: 'crossed fingers hope luck' },
      { char: '🤟', keywords: 'love you gesture ily' },
      { char: '🤘', keywords: 'rock on metal horns' },
      { char: '🤙', keywords: 'call me shaka chill' },
      { char: '👈', keywords: 'point left back' },
      { char: '👉', keywords: 'point right next' },
      { char: '👆', keywords: 'point up top above' },
      { char: '👇', keywords: 'point down bottom below' },
      { char: '☝️', keywords: 'index up one wait' },
      { char: '👍', keywords: 'thumbs up like agree yes approved' },
      { char: '👎', keywords: 'thumbs down dislike bad no' },
      { char: '✊', keywords: 'raised fist power strength' },
      { char: '👊', keywords: 'fist bump punch bro' },
      { char: '🤛', keywords: 'left fist bump' },
      { char: '🤜', keywords: 'right fist bump' },
      { char: '👏', keywords: 'clapping applaud bravo great' },
      { char: '🙌', keywords: 'raising hands praise hooray celebration' },
      { char: '👐', keywords: 'open hands hug' },
      { char: '🤲', keywords: 'palms together prayer' },
      { char: '🤝', keywords: 'handshake deal agree partner' },
      { char: '🙏', keywords: 'folded hands pray please thanks namaste' },
      { char: '✍️', keywords: 'writing signature letter note' },
      { char: '💅', keywords: 'nail polish sass attitude' },
      { char: '🤳', keywords: 'selfie camera photo' },
      { char: '💪', keywords: 'flex bicep strong muscle power' },
    ],
  },
  {
    id: 'hearts',
    name: 'Hearts & Love',
    icon: <Heart className="w-4 h-4" />,
    emojis: [
      { char: '❤️', keywords: 'red heart love passion' },
      { char: '🧡', keywords: 'orange heart warm care' },
      { char: '💛', keywords: 'yellow heart friendship happy' },
      { char: '💚', keywords: 'green heart nature jealous' },
      { char: '💙', keywords: 'blue heart loyalty trust' },
      { char: '💜', keywords: 'purple heart regal lavender' },
      { char: '🖤', keywords: 'black heart dark gothic' },
      { char: '🤍', keywords: 'white heart pure clean' },
      { char: '🤎', keywords: 'brown heart earth chocolate' },
      { char: '💔', keywords: 'broken heart sadness break up' },
      { char: '❣️', keywords: 'heart exclamation mark' },
      { char: '💕', keywords: 'two hearts romance cute' },
      { char: '💞', keywords: 'revolving hearts love' },
      { char: '💓', keywords: 'beating heart pulse alive' },
      { char: '💗', keywords: 'growing heart loving soft' },
      { char: '💖', keywords: 'sparkling heart shiny glitter' },
      { char: '💘', keywords: 'heart arrow cupid love' },
      { char: '💝', keywords: 'heart ribbon gift present' },
      { char: '💟', keywords: 'heart decoration purple' },
      { char: '💌', keywords: 'love letter mail envelope' },
      { char: '💋', keywords: 'kiss mark lips romance' },
      { char: '🫂', keywords: 'people hugging care hug' },
    ],
  },
  {
    id: 'fun',
    name: 'Fun & Celebration',
    icon: <Sparkles className="w-4 h-4" />,
    emojis: [
      { char: '🎉', keywords: 'party popper celebrate tada hooray' },
      { char: '🎊', keywords: 'confetti ball celebration congrats' },
      { char: '🎈', keywords: 'balloon birthday party' },
      { char: '🎂', keywords: 'birthday cake celebration treat' },
      { char: '🎁', keywords: 'wrapped gift present surprise' },
      { char: '🎇', keywords: 'sparkler fireworks night' },
      { char: '🎆', keywords: 'fireworks celebration festive' },
      { char: '✨', keywords: 'sparkles shine clean magic bright' },
      { char: '🌟', keywords: 'glowing star shine glow' },
      { char: '⭐', keywords: 'star favorite rating review' },
      { char: '💫', keywords: 'dizzy star shooting sparkle' },
      { char: '🔥', keywords: 'fire flame lit hot trend' },
      { char: '💥', keywords: 'collision boom burst pop' },
      { char: '💯', keywords: 'hundred 100 percent perfect real' },
      { char: '🏆', keywords: 'trophy win award champion 1st' },
      { char: '🥇', keywords: 'first place gold medal winner' },
      { char: '🥈', keywords: 'second place silver medal' },
      { char: '🥉', keywords: 'third place bronze medal' },
      { char: '🎯', keywords: 'bullseye target goal direct hit' },
      { char: '🎮', keywords: 'video game controller play gamer' },
      { char: '🎲', keywords: 'game die dice lucky chance' },
      { char: '🎨', keywords: 'artist palette colors draw art' },
      { char: '🎭', keywords: 'performing arts theater drama comedy' },
      { char: '🎬', keywords: 'clapper board film movie action' },
      { char: '🎤', keywords: 'microphone sing karaoke speak' },
      { char: '🎧', keywords: 'headphones music podcast listen' },
      { char: '🎵', keywords: 'musical note tune song' },
      { char: '🎶', keywords: 'notes music melodies rhythm' },
    ],
  },
  {
    id: 'food',
    name: 'Food & Drinks',
    icon: <Coffee className="w-4 h-4" />,
    emojis: [
      { char: '☕', keywords: 'hot beverage coffee tea espresso morning' },
      { char: '🍵', keywords: 'green tea matcha matcha' },
      { char: '🧃', keywords: 'beverage box juice straw drink' },
      { char: '🥤', keywords: 'cup with straw soda soft drink' },
      { char: '🍺', keywords: 'beer mug drink pub cheers' },
      { char: '🍻', keywords: 'clinking beer mugs party cheers' },
      { char: '🥂', keywords: 'clinking glasses champagne toast cheers' },
      { char: '🍷', keywords: 'wine glass red alcohol bar' },
      { char: '🍕', keywords: 'pizza slice cheese crust fast food' },
      { char: '🍔', keywords: 'hamburger burger fast food snack' },
      { char: '🍟', keywords: 'french fries chips fast food' },
      { char: '🌭', keywords: 'hot dog sausage snack' },
      { char: '🍿', keywords: 'popcorn cinema movie snack' },
      { char: '🥪', keywords: 'sandwich lunch bread meal' },
      { char: '🌮', keywords: 'taco mexican food crunchy' },
      { char: '🍜', keywords: 'steaming bowl ramen noodles soup' },
      { char: '🍣', keywords: 'sushi japanese fish food' },
      { char: '🍦', keywords: 'soft ice cream dessert dairy' },
      { char: '🍧', keywords: 'shaved ice dessert sweet' },
      { char: '🍩', keywords: 'doughnut sweet sugar treat' },
      { char: '🍪', keywords: 'cookie chocolate chip baked biscuit' },
      { char: '🍰', keywords: 'shortcake sweet cake slice' },
      { char: '🧁', keywords: 'cupcake sweet muffin icing' },
      { char: '🍫', keywords: 'chocolate bar sweet candy cacao' },
      { char: '🍬', keywords: 'candy sweet treat wrapper' },
    ],
  },
  {
    id: 'objects',
    name: 'Objects & Nature',
    icon: <Compass className="w-4 h-4" />,
    emojis: [
      { char: '🌸', keywords: 'cherry blossom flower pink spring' },
      { char: '🌹', keywords: 'rose red flower romance love' },
      { char: '🌺', keywords: 'hibiscus flower tropical' },
      { char: '🌻', keywords: 'sunflower yellow sunny summer' },
      { char: '🌼', keywords: 'blossom flower daisy yellow' },
      { char: '🍀', keywords: 'four leaf clover lucky good fortune' },
      { char: '🍁', keywords: 'maple leaf autumn fall orange' },
      { char: '🐶', keywords: 'dog face pet puppy canine cute' },
      { char: '🐱', keywords: 'cat face pet kitten feline meow' },
      { char: '🦊', keywords: 'fox face sly animal orange' },
      { char: '🐼', keywords: 'panda face bear animal cute' },
      { char: '🦁', keywords: 'lion face animal king brave' },
      { char: '🦋', keywords: 'butterfly insect pretty blue wing' },
      { char: '🚀', keywords: 'rocket launch fast space moon' },
      { char: '✈️', keywords: 'airplane flight travel vacation fly' },
      { char: '🚗', keywords: 'car automobile road drive trip' },
      { char: '🚲', keywords: 'bicycle bike ride cycle sport' },
      { char: '☀️', keywords: 'sun sunny day weather bright' },
      { char: '🌙', keywords: 'crescent moon night evening dream' },
      { char: '☁️', keywords: 'cloud weather sky overcast' },
      { char: '⚡', keywords: 'high voltage lightning bolt electric power' },
      { char: '🌈', keywords: 'rainbow weather sky colorful pride' },
      { char: '💡', keywords: 'light bulb idea smart bright creativity' },
      { char: '📌', keywords: 'pushpin pin note location mark' },
      { char: '🔒', keywords: 'locked padlock security safe secret' },
      { char: '🔑', keywords: 'key password access unlock secret' },
      { char: '📱', keywords: 'mobile phone smartphone call text screen' },
      { char: '💻', keywords: 'laptop computer code tech work screen' },
    ],
  },
];

export default function EmojiPicker({ onSelectEmoji, onClose }: EmojiPickerProps) {
  const [activeTab, setActiveTab] = useState('smileys');
  const [searchQuery, setSearchQuery] = useState('');
  const pickerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Close when clicking outside
  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [onClose]);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  // Filter emojis based on query
  const filteredEmojis = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return null;

    const allEmojis: { char: string; keywords: string }[] = [];
    for (const cat of EMOJI_CATEGORIES) {
      for (const item of cat.emojis) {
        if (item.keywords.toLowerCase().includes(query) || item.char === query) {
          allEmojis.push(item);
        }
      }
    }
    return allEmojis;
  }, [searchQuery]);

  const currentCategory = useMemo(() => {
    return EMOJI_CATEGORIES.find((cat) => cat.id === activeTab) || EMOJI_CATEGORIES[0];
  }, [activeTab]);

  return (
    <div
      ref={pickerRef}
      role="dialog"
      aria-label="Emoji Picker"
      className="absolute bottom-16 left-2 sm:left-4 z-40 w-[310px] sm:w-[350px] bg-white/95 backdrop-blur-md border border-[#E8E3FA] rounded-2xl shadow-xl shadow-[#4C3A8C]/15 flex flex-col overflow-hidden animate-fadeIn"
      style={{ maxHeight: '380px' }}
    >
      {/* Search Header */}
      <div className="p-2.5 pb-2 border-b border-[#F0EDFD] flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="w-3.5 h-3.5 text-[#9E96BE] absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search emojis..."
            aria-label="Search emojis"
            className="w-full text-xs py-1.5 pl-8 pr-2.5 bg-[#F8F7FF] border border-[#E8E3FA] rounded-lg text-[#1E1B2E] placeholder-[#9E96BE] focus:outline-none focus:border-[#7C5CFC] transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[#9E96BE] hover:text-[#4C3A8C] p-0.5"
              aria-label="Clear search"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
        <button
          onClick={onClose}
          className="p-1.5 text-[#797196] hover:text-[#4C3A8C] hover:bg-[#F8F7FF] rounded-lg transition-colors"
          aria-label="Close emoji picker"
          title="Close emoji picker"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Emoji Scroll Area */}
      <div className="flex-1 overflow-y-auto p-2.5 min-h-[190px] max-h-[240px] select-none scrollbar-thin">
        {filteredEmojis !== null ? (
          <div>
            <div className="text-[11px] font-semibold text-[#797196] mb-1.5 px-1 flex items-center justify-between">
              <span>Search results</span>
              <span className="font-normal text-[10px]">{filteredEmojis.length} found</span>
            </div>
            {filteredEmojis.length > 0 ? (
              <div className="grid grid-cols-7 gap-1">
                {filteredEmojis.map((item, idx) => (
                  <button
                    key={`${item.char}-${idx}`}
                    type="button"
                    onClick={() => onSelectEmoji(item.char)}
                    title={item.keywords}
                    aria-label={item.keywords}
                    className="h-9 w-9 flex items-center justify-center text-xl rounded-lg hover:bg-[#EDE9FE]/70 active:scale-90 hover:scale-110 transition-transform focus:outline-none focus:ring-1 focus:ring-[#7C5CFC]"
                  >
                    {item.char}
                  </button>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-xs text-[#9E96BE]">
                No emojis match &ldquo;{searchQuery}&rdquo;
              </div>
            )}
          </div>
        ) : (
          <div>
            <div className="text-[11px] font-semibold text-[#797196] mb-1.5 px-1">
              {currentCategory.name}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {currentCategory.emojis.map((item, idx) => (
                <button
                  key={`${item.char}-${idx}`}
                  type="button"
                  onClick={() => onSelectEmoji(item.char)}
                  title={item.keywords}
                  aria-label={item.keywords}
                  className="h-9 w-9 flex items-center justify-center text-xl rounded-lg hover:bg-[#EDE9FE]/70 active:scale-90 hover:scale-110 transition-transform focus:outline-none focus:ring-1 focus:ring-[#7C5CFC]"
                >
                  {item.char}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Category Tabs (visible when not searching) */}
      {!searchQuery && (
        <div className="px-2 py-1.5 bg-[#FAF9FF] border-t border-[#F0EDFD] flex items-center justify-around">
          {EMOJI_CATEGORIES.map((cat) => {
            const isActive = activeTab === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveTab(cat.id)}
                title={cat.name}
                aria-label={cat.name}
                className={`p-1.5 rounded-lg transition-colors ${
                  isActive
                    ? 'bg-[#EDE9FE] text-[#7C5CFC]'
                    : 'text-[#9E96BE] hover:text-[#4C3A8C] hover:bg-white'
                }`}
              >
                {cat.icon}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
